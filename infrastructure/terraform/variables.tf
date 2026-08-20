variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short name used to prefix and tag resources."
  type        = string
  default     = "cicd-platform-demo"
}

variable "environment" {
  description = "Deployment environment name (e.g. demo, staging, production)."
  type        = string
  default     = "demo"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for the public subnet the EC2 instance runs in."
  type        = string
  default     = "10.20.1.0/24"
}

variable "availability_zone" {
  description = "Availability zone for the public subnet. Defaults to the first AZ in the region."
  type        = string
  default     = null
}

variable "instance_type" {
  description = "EC2 instance type. t3.micro is Free Tier eligible in most accounts."
  type        = string
  default     = "t3.micro"
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size in GB."
  type        = number
  default     = 30
}

variable "ssh_key_name" {
  description = <<-EOT
    Name of an existing EC2 key pair to attach to the instance for SSH access.
    Create one with: aws ec2 create-key-pair --key-name cicd-platform-demo --query 'KeyMaterial' --output text > cicd-platform-demo.pem
  EOT
  type        = string
}

variable "ssh_allowed_cidr" {
  description = <<-EOT
    CIDR block allowed to SSH into the instance. Deliberately has no default -
    you must scope this to your own IP (e.g. "1.2.3.4/32") rather than opening
    SSH to the internet.
  EOT
  type        = string

  validation {
    condition     = var.ssh_allowed_cidr != "0.0.0.0/0"
    error_message = "ssh_allowed_cidr must not be 0.0.0.0/0. Scope SSH access to your own IP address."
  }
}

variable "app_http_allowed_cidr" {
  description = "CIDR block allowed to reach the application over HTTP."
  type        = string
  default     = "0.0.0.0/0"
}

variable "app_port" {
  description = "Host port the application (frontend container) is published on."
  type        = number
  default     = 80
}

variable "ssh_user" {
  description = "Default SSH user for the chosen AMI (ec2-user for Amazon Linux 2023)."
  type        = string
  default     = "ec2-user"
}
