# Deployment guide

This document covers the full path from a merged pull request to a running
container on AWS: what the CI/CD pipeline automates, and the one-time manual
setup it deliberately does **not** automate.

## Overview

```
git push (main) → CI/CD pipeline → GHCR (tagged images) → OIDC → AWS SSM → EC2 host → docker compose
```

1. Terraform provisions the EC2 host once (see [`infrastructure/terraform`](../infrastructure/terraform)).
2. A human completes a short one-time setup on that host (below).
3. From then on, every push to `main` that passes lint/typecheck/tests/security
   scans builds new images, tags them with the commit SHA, pushes them to
   GHCR, authenticates to AWS via OIDC, and deploys that exact SHA to the
   host through AWS Systems Manager - no SSH connection from the runner, and
   no AWS credentials stored in GitHub. See
   [Authenticating to AWS: OpenID Connect](#authenticating-to-aws-openid-connect-oidc)
   and [Deploying via AWS Systems Manager](#deploying-via-aws-systems-manager-ssm)
   below for how each piece works.

## One-time host setup

Terraform's `user_data` script installs Docker and Docker Compose and
creates `/opt/cicd-platform-demo`, but two things are intentionally left to
a human, since they involve secrets that should never pass through
`user_data` (which is visible to anyone with EC2 `DescribeInstanceAttribute`
permission) or be committed to git:

1. **Make the GHCR packages public** (one-time, after the first successful
   push to `main`). GitHub creates a package the first time a workflow
   pushes to it, and that package defaults to **private** regardless of the
   repository's own visibility. For this project's threat model that
   default is unnecessarily strict: the image is built entirely from this
   public repository, so making it public discloses nothing that isn't
   already public, and it means the EC2 host needs **zero credentials** to
   pull it - see [GHCR authentication](#ghcr-authentication) below for the
   full reasoning and the private-registry alternative.

   In GitHub: **your profile → Packages → `cicd-platform-demo-backend`
   (and `-frontend`) → Package settings → Change visibility → Public**.

2. SSH into the host as a human operator (`terraform output ssh_command`) and
   create `/opt/cicd-platform-demo/.env`. This is the one remaining use of
   SSH in this project - the automated pipeline itself deploys through SSM,
   not SSH (see below), but SSH access to the instance is still provisioned
   for one-time setup and manual troubleshooting, restricted to
   `var.ssh_allowed_cidr`:

   ```bash
   sudo mkdir -p /opt/cicd-platform-demo
   sudo tee /opt/cicd-platform-demo/.env > /dev/null <<'EOF'
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=<generate a strong password>
   POSTGRES_DB=cicd_platform_demo
   CORS_ORIGIN=http://<your-eip-or-domain>
   LOG_LEVEL=info
   RATE_LIMIT_WINDOW_MS=60000
   RATE_LIMIT_MAX=100
   EOF
   sudo chown ec2-user:ec2-user /opt/cicd-platform-demo/.env
   chmod 600 /opt/cicd-platform-demo/.env
   ```

   `docker compose` automatically loads a `.env` file from its working
   directory, so these values are picked up by `docker-compose.prod.yml`
   without further configuration. This file never touches git or CI.

3. Confirm the deploying user can run `docker` without `sudo` (the
   `user_data` script already adds the default user to the `docker` group,
   but you may need to reconnect for group membership to take effect):

   ```bash
   docker ps
   ```

## What the pipeline automates

See [`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml). On
every push to `main` that passes all quality gates:

1. `docker-build-scan` builds both images and scans them with Trivy.
2. `push-images` pushes them to GHCR as `ghcr.io/<owner>/cicd-platform-demo-backend:<sha>`
   and `:latest` (and the same for `-frontend`). **The SHA tag is what
   actually gets deployed** - `latest` exists for convenience (e.g. manual
   `docker pull` while debugging), not for the deploy step itself.
3. `deploy` authenticates to AWS via OIDC (no stored AWS credentials - see
   below), then runs a script on the EC2 host through **AWS Systems
   Manager Run Command** (`aws ssm send-command`, not SSH):

   ```bash
   curl -fsSL "https://raw.githubusercontent.com/<owner>/cicd-platform-demo/<sha>/docker-compose.prod.yml" \
     -o docker-compose.prod.yml
   export BACKEND_IMAGE=ghcr.io/<owner>/cicd-platform-demo-backend:<sha>
   export FRONTEND_IMAGE=ghcr.io/<owner>/cicd-platform-demo-frontend:<sha>
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d --remove-orphans
   docker image prune -f
   ```

   The workflow submits this as an `AWS-RunShellScript` SSM document via
   `aws ssm send-command`, then polls `aws ssm get-command-invocation`
   every 5 seconds (up to 5 minutes) until the command reports `Success`,
   `Failed`, `Cancelled`, or `TimedOut`, printing the remote script's
   stdout/stderr into the job log either way.

   Because the tag is pinned to `github.sha` (not `latest`) at every step -
   the image tag pushed by `push-images`, the `docker-compose.prod.yml`
   fetched straight from that commit via raw.githubusercontent.com, the
   shell variables exported in this script, and the `image:` field in
   `docker-compose.prod.yml` all derive from the same `github.sha` - the
   host always ends up running the exact commit that passed CI, never
   whatever `latest` happened to point to when the deploy ran.
   `docker-compose.prod.yml` has no fallback tag for
   these variables (`${BACKEND_IMAGE:?...}`), so a deploy with a missing/empty
   variable fails immediately instead of silently pulling nothing or `latest`.
4. The backend container's entrypoint (`docker/backend-entrypoint.sh`) runs
   `prisma migrate deploy` before starting the server, so schema migrations
   ship as part of the same deploy - no separate migration step to forget.

## Authenticating to AWS: OpenID Connect (OIDC)

`deploy` needs to call the AWS API (`ssm:SendCommand`) to reach the EC2 host,
but the pipeline stores **no AWS access keys as GitHub Secrets at all**.
Instead it uses OIDC:

1. The Actions runner requests a short-lived, signed JSON Web Token from
   GitHub's own OIDC issuer (`token.actions.githubusercontent.com`) - this
   requires the `id-token: write` permission, which `deploy` declares.
2. `aws-actions/configure-aws-credentials` presents that token to AWS STS
   and calls `sts:AssumeRoleWithWebIdentity` against
   `cicd-platform-demo-github-actions-role`.
3. AWS validates the token against an OIDC identity provider registered in
   the account (`aws_iam_openid_connect_provider.github_actions` in
   [`infrastructure/terraform/iam.tf`](../infrastructure/terraform/iam.tf)),
   checks the role's trust policy conditions, and - if they pass - issues
   temporary credentials scoped to just that job run.

This is the current standard practice for GitHub Actions → AWS: no
long-lived access key sitting in GitHub Secrets to rotate or leak, and
credentials that expire with the job instead of outliving a compromised
runner.

**What the role can actually do** is deliberately narrow: the role's own
permissions are `ssm:SendCommand` and `ssm:GetCommandInvocation` only
(`aws_iam_role_policy.github_actions_ssm`) - exactly what's needed to
trigger and observe the SSM deploy below, nothing that can create, modify,
or delete any other AWS resource.

### The trust policy: the `sub` claim's owner/repo ID format

The trust policy restricts *who* can assume the role via two conditions on
the presented token:

- `token.actions.githubusercontent.com:aud` must equal `sts.amazonaws.com`.
- `token.actions.githubusercontent.com:sub` must match a pattern scoping
  assumption to this repository's `production` environment.

The `sub` value configured in `infrastructure/terraform/iam.tf` is:

```
repo:philik04@151728029/cicd-platform-demo@1330223444:environment:production
```

This differs from the older `repo:<owner>/<repo>:environment:<name>` format
some GitHub OIDC examples still show, but it's expected, not a bug: per
GitHub's [OpenID Connect reference](https://docs.github.com/en/actions/reference/security/oidc),
**"for repositories created after July 15, 2026, or that have opted in to
immutable subject claims, the `sub` claim includes `owner_id` and
`repo_id`"**, in the form `repo:OWNER@OWNER-ID/REPO@REPO-ID:...`. This
repository was created 2026-08-10 - after that cutoff - so it gets this
newer, immutable-subject-claim format automatically; the `@151728029` and
`@1330223444` segments are this repo's actual `owner_id` and `repo_id`,
not malformed input.

This is verified, not assumed: a token decoded from a real `deploy` run
(`ci: debug OIDC claims`, run
[32419728680](https://github.com/philik04/cicd-platform-demo/actions/runs/32419728680))
had exactly this `sub` value, and that same run's "Configure AWS
credentials" step logged `Authenticated as assumedRoleId
AROA42VHX4DGTH6VA2JTM:GitHubActions` followed by a successful SSM deploy
(`SSM status: Success`). The trust policy is doing its job correctly.

### Role of the `production` GitHub Environment

`deploy` runs under `environment: { name: production }`. That's what puts
`environment:production` into the OIDC token's `sub` claim in the first
place - the trust condition above only has something meaningful to check
because the job is tied to this named environment - and it's also the
mechanism GitHub environments provide for deployment protection rules
(required reviewers, wait timers, branch restrictions) and
environment-scoped secrets/variables. As configured today, the
`production` environment has **no protection rules** (`protection_rules: []`,
`deployment_branch_policy: null` via the GitHub API): it currently exists
as the named context the OIDC condition and future approval gates would
hang off, not as an active approval gate itself.

## Deploying via AWS Systems Manager (SSM)

Once `deploy` holds temporary AWS credentials, it does not SSH anywhere. It
submits the deploy script (shown above) as an **SSM Run Command** against
the EC2 instance by instance ID, using the built-in `AWS-RunShellScript`
document, then polls for the result - see the exact `aws ssm send-command`
/ `aws ssm get-command-invocation` invocation in
[`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml).

Two things make this work without any new instance-side setup:

- **The instance is already SSM-managed, for an unrelated reason.** The EC2
  instance role (`aws_iam_role.instance` in `iam.tf`) already has
  `AmazonSSMManagedInstanceCore` attached, originally so a human could use
  SSM Session Manager as a safer alternative to broad SSH exposure (see
  [`infrastructure/terraform/README.md`](../infrastructure/terraform/README.md)).
  That same managed-instance registration is what makes the instance a
  valid Run Command target too.
- **No inbound port is required for this path.** The SSM agent on the
  instance polls *outbound* to AWS; the security group's SSH rule plays no
  part in CI-driven deploys and exists solely for the human-operator SSH
  use case described earlier in this document.

## GHCR authentication

**The EC2 host never authenticates to GHCR at all - no username, no token,
no credential of any kind.** This is a deliberate design choice, not an
oversight, and it's worth spelling out why:

- The packages this pipeline pushes (`cicd-platform-demo-backend` /
  `-frontend`) are set to **public** visibility (the one-time step above).
  `docker pull` of a public GHCR image requires zero authentication.
- Because the image is built entirely from this public repository's source,
  making it public discloses nothing beyond what `git clone` already gives
  anyone. There is no confidentiality boundary being crossed.
- This means there is no GHCR credential to rotate, leak, or accidentally
  leave behind in `~/.docker/config.json` on a long-lived host - the
  simplest possible answer to "how does the host authenticate" is "it
  doesn't need to."

Concretely, in [`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml):

- `push-images` **does** authenticate to GHCR, via
  `docker/login-action` with the workflow's auto-generated `GITHUB_TOKEN`
  - scoped to `packages: write` for that job only, and that job only. This
    all happens on the GitHub-hosted runner; the token never leaves it.
- `deploy` has no `packages` permission and runs no `docker login` - the
  script it submits via SSM only exports the two image variables and calls
  `docker compose pull`, which works anonymously against public packages.

**No token is hardcoded anywhere** (not in Terraform, not in
`docker-compose.prod.yml`, not baked into an image layer, not committed to
git). The only credential involved anywhere in the deploy path is the
short-lived AWS OIDC token described above, which authenticates to *AWS*
(specifically, to call SSM) - not to GHCR, and not to the host directly.

### If you fork this for a private/closed-source project

If your images must stay private, the packages inherit the token-based
access `docker/login-action` already grants on the runner - but pulling from
an *external* host (EC2) needs its own credential, since GHCR has no idea
the EC2 box is "part of" this repo. The minimal-blast-radius option:

1. Create a **fine-grained personal access token** scoped to this repository
   only, with the single permission `Packages: Read`. Do not use a classic
   PAT with broad `read:packages` across every repo you own.
2. Store it as a GitHub Secret (e.g. `GHCR_PAT`) - never in Terraform, never
   in `docker-compose.prod.yml`, never in a Dockerfile.
3. In the remote script `deploy` submits via SSM, log in immediately before
   pulling and log out immediately after, so the credential in
   `~/.docker/config.json` exists on disk for the shortest possible window
   rather than persisting indefinitely:
   ```bash
   echo "${{ secrets.GHCR_PAT }}" | docker login ghcr.io -u <your-username> --password-stdin
   docker compose -f docker-compose.prod.yml pull
   docker logout ghcr.io
   docker compose -f docker-compose.prod.yml up -d --remove-orphans
   ```
   Even with the logout, treat this as strictly weaker than the public-package
   approach: the token is briefly present in cleartext on disk and in shell
   history/process listings during the login. For a genuinely private
   deployment at any scale beyond a portfolio demo, a managed registry with
   IAM-based pull authorization (e.g. ECR with the EC2 instance role granted
   `ecr:GetDownloadUrl`/`BatchGetImage`) avoids long-lived tokens entirely -
   noted here rather than implemented, to keep this project's scope to what
   it's actually demonstrating.

## Required GitHub Secrets

**None.** This is the practical payoff of the OIDC setup above: `deploy`
authenticates to AWS via a short-lived OIDC token rather than a stored
credential, and reaches the host through SSM rather than SSH, so there is
no `EC2_HOST` / `EC2_SSH_USER` / `EC2_SSH_PRIVATE_KEY` (or any AWS access
key) to configure as a GitHub Secret for deployment to work.

`GITHUB_TOKEN` (pushing to GHCR from `push-images`, uploading Trivy SARIF
results from `docker-build-scan`, requesting the OIDC token itself for
`deploy`) is provided automatically by GitHub Actions, scoped per-job via
each job's `permissions:` block - nothing to configure.

**What *is* currently hardcoded, as plain values in
[`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml) rather than
a secret or variable:** the IAM role ARN
(`arn:aws:iam::881893826765:role/cicd-platform-demo-github-actions-role`)
and the EC2 instance ID (`i-0e3e99eb06727e49b`) in the `deploy` job. Neither
is a secret in the sensitive-value sense - an IAM role ARN and an instance
ID aren't credentials - but hardcoding them ties the workflow to this one
AWS account and this one instance: forking the project, or replacing the
instance (e.g. a Terraform-driven instance replacement), means editing the
workflow file directly rather than updating a secret/variable. Moving both
to repository/environment variables (`vars.AWS_ROLE_ARN`,
`vars.EC2_INSTANCE_ID`) would be the natural next step - tracked as a gap
below rather than changed here.

## Rolling back

Because every deployed image is tagged with a commit SHA, rolling back
means re-running the same SSM deploy script with an older SHA. There is no
one-click "redeploy this SHA" trigger yet (`workflow_dispatch` exists on
this workflow, but `deploy` is currently gated to `github.event_name ==
'push'`, so a manual run does not reach the deploy step - see the gaps
list below), so today this is a manual operator action, either:

- **Via SSM**, matching what CI itself does - run the same
  `aws ssm send-command` invocation from `.github/workflows/ci-cd.yml`
  with `<previous-sha>` in place of `${{ github.sha }}` (requires AWS
  credentials for whoever's running it - e.g. `aws sso login`, see
  [`infrastructure/terraform/README.md`](../infrastructure/terraform/README.md#aws-authentication)); or
- **Via SSH**, using the access still provisioned for human operators:

  ```bash
  ssh -i cicd-platform-demo.pem ec2-user@<host>
  cd /opt/cicd-platform-demo
  export BACKEND_IMAGE=ghcr.io/<owner>/cicd-platform-demo-backend:<previous-sha>
  export FRONTEND_IMAGE=ghcr.io/<owner>/cicd-platform-demo-frontend:<previous-sha>
  docker compose -f docker-compose.prod.yml pull
  docker compose -f docker-compose.prod.yml up -d
  ```

Note this rolls back application code but not database schema - Prisma
migrations are forward-only in this setup, matching how most real
deployments operate.

## Local, non-Docker deployment (for debugging)

You generally shouldn't need this outside of local development - see
[Quick Start](../README.md#quick-start) in the README instead.

## Known gaps

Found while writing this section of the docs; not fixed here since they're
infrastructure/workflow changes, not documentation:

1. **The IAM role ARN and EC2 instance ID are hardcoded in
   `ci-cd.yml`** rather than stored as repository/environment variables -
   see [Required GitHub Secrets](#required-github-secrets).
2. **`workflow_dispatch` doesn't actually reach `deploy`** - both
   `push-images` and `deploy` are gated on `github.event_name == 'push'`,
   so a manual run of the workflow completes the quality/security jobs but
   silently skips image publishing and deployment. If manual re-deploy is
   the intent, the `if:` condition on both jobs needs to also allow
   `workflow_dispatch`.
3. **The `production` environment has no protection rules configured** -
   see [Role of the `production` GitHub Environment](#role-of-the-production-github-environment).
   Not necessarily wrong for a portfolio project, but worth a deliberate
   decision rather than an assumption either way.
