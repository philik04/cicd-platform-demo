#!/bin/bash
set -euo pipefail

# Bootstraps a fresh EC2 instance so it's ready to receive deployments from
# the CI/CD pipeline (see .github/workflows/ci-cd.yml `deploy` job). This
# script installs Docker and prepares an app directory; it deliberately does
# NOT pull or start the application itself - that is the CI/CD pipeline's job.

dnf update -y
dnf install -y docker git

systemctl enable docker
systemctl start docker
usermod -aG docker ${ssh_user}

curl -SL https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64 \
  -o /usr/libexec/docker/cli-plugins/docker-compose
chmod +x /usr/libexec/docker/cli-plugins/docker-compose

mkdir -p /opt/${project_name}
chown ${ssh_user}:${ssh_user} /opt/${project_name}

echo "Bootstrap complete for ${project_name}" > /var/log/user-data-complete.log
