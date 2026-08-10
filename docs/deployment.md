# Deployment guide

This document covers the full path from a merged pull request to a running
container on AWS: what the CI/CD pipeline automates, and the one-time manual
setup it deliberately does **not** automate.

## Overview

```
git push (main) → CI/CD pipeline → GHCR (tagged images) → EC2 host → docker compose
```

1. Terraform provisions the EC2 host once (see [`infrastructure/terraform`](../infrastructure/terraform)).
2. A human completes a short one-time setup on that host (below).
3. From then on, every push to `main` that passes lint/typecheck/tests/security
   scans builds new images, tags them with the commit SHA, pushes them to
   GHCR, and deploys that exact SHA to the host.

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

2. SSH into the host (`terraform output ssh_command`) and create
   `/opt/cicd-platform-demo/.env`:

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
3. `deploy` copies the versioned `docker-compose.prod.yml` to the host,
   then SSHes in and runs:

   ```bash
   export BACKEND_IMAGE=ghcr.io/<owner>/cicd-platform-demo-backend:<sha>
   export FRONTEND_IMAGE=ghcr.io/<owner>/cicd-platform-demo-frontend:<sha>
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d --remove-orphans
   ```

   Because the tag is pinned to `github.sha` (not `latest`) at every step -
   the image tag pushed by `push-images`, the shell variable exported in
   this script, and the `image:` field in `docker-compose.prod.yml` all
   derive from the same `github.sha` - the host always ends up running the
   exact commit that passed CI, never whatever `latest` happened to point
   to when the deploy ran. `docker-compose.prod.yml` has no fallback tag for
   these variables (`${BACKEND_IMAGE:?...}`), so a deploy with a missing/empty
   variable fails immediately instead of silently pulling nothing or `latest`.
4. The backend container's entrypoint (`docker/backend-entrypoint.sh`) runs
   `prisma migrate deploy` before starting the server, so schema migrations
   ship as part of the same deploy - no separate migration step to forget.

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
- `deploy` has no `packages` permission and runs no `docker login` -
  the SSH script only exports the two image variables and calls
  `docker compose pull`, which works anonymously against public packages.

**No token is hardcoded anywhere** (not in Terraform, not in
`docker-compose.prod.yml`, not baked into an image layer, not committed to
git) - the only credentials involved in the entire deploy path are the three
SSH secrets below, which authenticate to the *host*, not to GHCR.

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
3. In the `deploy` script, log in immediately before pulling and log out
   immediately after, so the credential in `~/.docker/config.json` exists on
   disk for the shortest possible window rather than persisting indefinitely:
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

Configure these under **Settings → Secrets and variables → Actions** (and,
for `deploy`, scope them to a `production` environment with required
reviewers if you want a manual approval gate before deploys):

| Secret | Used by | Description |
|---|---|---|
| `EC2_HOST` | `deploy` | Public IP or DNS name of the EC2 instance (`terraform output public_ip`) |
| `EC2_SSH_USER` | `deploy` | SSH user, `ec2-user` for Amazon Linux 2023 |
| `EC2_SSH_PRIVATE_KEY` | `deploy` | Private key matching the `ssh_key_name` used in Terraform, PEM format |

`GITHUB_TOKEN` (pushing to GHCR from `push-images`, uploading Trivy SARIF
results from `docker-build-scan`) is provided automatically by GitHub
Actions, scoped per-job via each job's `permissions:` block - nothing to
configure, and it is never used inside the `deploy` job (see
[GHCR authentication](#ghcr-authentication) above).

No secret is ever printed to logs, written into an image layer, or checked
into the repository. `EC2_SSH_PRIVATE_KEY` only ever exists in GitHub's
encrypted secret store and in the ephemeral runner's memory during the
`deploy` job - it authenticates to the EC2 host over SSH, and is never sent
to, or used against, GHCR.

## Rolling back

Because every deployed image is tagged with a commit SHA, rolling back is a
matter of re-running the deploy with an older SHA:

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

You generally shouldn't need this outside of local development - see the
[README](../README.md#local-development) instead.
