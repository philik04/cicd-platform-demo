# Terraform: AWS infrastructure

Provisions a minimal, single-instance AWS environment suitable for running
`cicd-platform-demo` as a portfolio/demo deployment: one VPC, one public
subnet, one EC2 instance running Docker Compose. This is intentionally not a
highly-available, multi-AZ production topology — see [Scaling this up](#scaling-this-up)
for what a production version would add.

## What gets created

| Resource | Purpose |
|---|---|
| `aws_vpc` | Isolated network (`10.20.0.0/16` by default) |
| `aws_internet_gateway` + `aws_route_table` | Internet egress/ingress for the public subnet |
| `aws_subnet` (public) | Where the EC2 instance runs |
| `aws_security_group` | Allows SSH (restricted CIDR), HTTP (app port), and all outbound |
| `aws_iam_role.instance` + `aws_iam_instance_profile` | Grants the EC2 instance SSM Session Manager access only - no application-level AWS permissions |
| `aws_iam_openid_connect_provider.github_actions` + `aws_iam_role.github_actions` | Lets GitHub Actions authenticate to AWS via OIDC (no stored AWS credentials) to deploy - see [`docs/deployment.md`](../../docs/deployment.md#authenticating-to-aws-openid-connect-oidc) |
| `aws_instance` | Amazon Linux 2023 EC2 host running Docker + Docker Compose |
| `aws_eip` | Stable public IP for the instance |

PostgreSQL is **not** provisioned as an AWS resource and has no security
group rule of its own - it runs as a container on the EC2 host, reachable
only from the backend container over the internal Docker Compose network
(see `../../docker-compose.prod.yml`). Nothing in this stack exposes port
5432 to the internet.

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.6
- An AWS account and an IAM principal with permission to create VPC, EC2,
  and IAM resources
- An existing EC2 key pair in the target region:
  ```bash
  aws ec2 create-key-pair --key-name cicd-platform-demo \
    --query 'KeyMaterial' --output text > cicd-platform-demo.pem
  chmod 400 cicd-platform-demo.pem
  ```

## AWS authentication

This section covers how *you*, running Terraform locally, authenticate to
AWS. GitHub Actions authenticates separately, via OIDC, to deploy - that's
a distinct mechanism with no credentials for you to configure; see
[`docs/deployment.md`](../../docs/deployment.md#authenticating-to-aws-openid-connect-oidc).

Terraform's AWS provider reads credentials the same way the AWS CLI does -
**never hardcode credentials in `.tf` files**. Use one of:

```bash
# Option 1: environment variables
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...   # if using temporary credentials

# Option 2: a named profile from `aws configure`
export AWS_PROFILE=your-profile-name
```

## Usage

```bash
cd infrastructure/terraform

cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: set ssh_key_name and ssh_allowed_cidr at minimum

terraform init
terraform fmt -check      # verify formatting
terraform validate        # verify configuration is internally consistent
terraform plan            # review what will be created
terraform apply           # create the infrastructure
```

To tear everything down:

```bash
terraform destroy
```

> `terraform.tfvars` is gitignored. `ssh_allowed_cidr` has no default and
> Terraform will refuse to plan/apply with `0.0.0.0/0` - scope it to your own
> IP (`curl -s https://checkip.amazonaws.com`).

## Required variables

| Variable | Description | Default |
|---|---|---|
| `ssh_key_name` | Name of an existing EC2 key pair | *(required, no default)* |
| `ssh_allowed_cidr` | CIDR allowed to SSH in; must not be `0.0.0.0/0` | *(required, no default)* |
| `aws_region` | AWS region | `us-east-1` |
| `instance_type` | EC2 instance type | `t3.micro` |
| `app_port` | Host port the frontend container is published on | `80` |
| `app_http_allowed_cidr` | CIDR allowed to reach the app over HTTP | `0.0.0.0/0` |
| `root_volume_size_gb` | Root EBS volume size | `20` |
| `project_name` / `environment` | Naming/tagging | `cicd-platform-demo` / `demo` |

## Outputs

| Output | Description |
|---|---|
| `public_ip` | Elastic IP of the instance |
| `application_url` | `http://<public_ip>[:<app_port>]` |
| `ssh_command` | Ready-to-run SSH command |
| `instance_id`, `vpc_id`, `security_group_id` | For cross-referencing in the AWS console |

## How the instance is configured

The instance boots from an Amazon Linux 2023 AMI (looked up dynamically via
`data "aws_ami"`, not pinned to an ID) and runs `user_data.sh.tpl` once on
first boot via cloud-init. That script:

1. Installs `docker` and enables/starts the `docker` service
2. Installs the `docker compose` CLI plugin
3. Adds the default user to the `docker` group
4. Creates `/opt/<project_name>` as the deployment directory

The script does **not** pull or start the application - that's the CI/CD
pipeline's job (see `.github/workflows/ci-cd.yml`, `deploy` job), which
authenticates to AWS via OIDC and runs a script on the instance through AWS
Systems Manager Run Command (not SSH) that fetches the versioned
`docker-compose.prod.yml` for that exact commit and runs
`docker compose pull && docker compose up -d`. The `.env` file with database
credentials is a separate, one-time human step - never written by CI. See
[`../../docs/deployment.md`](../../docs/deployment.md) for the full
picture, including what needs to exist on the host before the first
deploy and how the OIDC/SSM mechanism works.

## Security notes

- IMDSv2 is enforced (`http_tokens = "required"`) to mitigate SSRF-based
  credential theft.
- The instance role only has `AmazonSSMManagedInstanceCore` attached -
  enough for troubleshooting via Session Manager, nothing else. The
  application does not call any AWS APIs and has no AWS credentials of its
  own.
- The separate GitHub Actions role (`github_actions`) that CI assumes via
  OIDC to deploy is scoped to `ssm:SendCommand` and
  `ssm:GetCommandInvocation` only - it cannot touch any other AWS resource.
  Its trust policy restricts assumption to this repository's `production`
  environment via the `sub` claim, using GitHub's newer immutable-subject-claim
  format (`repo:OWNER@OWNER-ID/REPO@REPO-ID:...`, not just `owner/repo`) - see
  [`docs/deployment.md`](../../docs/deployment.md#the-trust-policy-the-sub-claims-ownerrepo-id-format)
  for how that's verified.
- The root volume is encrypted at rest.
- SSH is restricted by CIDR via a required variable with no permissive
  default; the HTTP port is intentionally the only other inbound rule.
- State is local by default for portfolio use. For team use, switch to a
  remote backend (S3 + DynamoDB lock table) - see the commented-out example
  in `versions.tf`.

## Validating without AWS credentials

`terraform fmt`, `terraform validate`, and `terraform init` all succeed with
no AWS credentials configured, since they don't call the AWS API.
`terraform plan`/`apply` do call the API (to look up the current AMI and
availability zones) and will fail with a credentials error until you
configure authentication as described above - that failure is expected and
is not a sign of a configuration problem.

## Scaling this up

Deliberately out of scope for a single-instance demo, but worth naming as
the next steps toward a production-grade version of this stack:

- Multi-AZ subnets behind an Application Load Balancer, EC2 in an Auto
  Scaling Group instead of a single instance
- Managed database (RDS for PostgreSQL) instead of a container on the host
- A remote Terraform backend with state locking
- ACM-issued TLS certificate + HTTPS listener
- A private subnet for the app tier with the ALB as the only public entry
  point
