resource "aws_security_group" "app" {
  name        = "${var.project_name}-app-sg"
  description = "Security group for the ${var.project_name} EC2 instance"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-app-sg"
  }
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.app.id
  description       = "SSH from an explicitly allow-listed CIDR only"
  cidr_ipv4         = var.ssh_allowed_cidr
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.app.id
  description       = "HTTP access to the application"
  cidr_ipv4         = var.app_http_allowed_cidr
  from_port         = var.app_port
  to_port           = var.app_port
  ip_protocol       = "tcp"
}

# PostgreSQL is deliberately NOT exposed here: it only listens on the
# Docker Compose internal network (see docker-compose.prod.yml) and is
# reachable exclusively from the backend container on the same host.

resource "aws_vpc_security_group_egress_rule" "all_outbound" {
  security_group_id = aws_security_group.app.id
  description       = "Allow all outbound traffic (image pulls, package updates, etc.)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
