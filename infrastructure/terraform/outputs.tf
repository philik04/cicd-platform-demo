output "instance_id" {
  description = "EC2 instance ID."
  value       = aws_instance.app.id
}

output "public_ip" {
  description = "Elastic IP address attached to the EC2 instance."
  value       = aws_eip.app.public_ip
}

output "application_url" {
  description = "URL the deployed application is reachable at."
  value       = "http://${aws_eip.app.public_ip}${var.app_port == 80 ? "" : ":${var.app_port}"}"
}

output "ssh_command" {
  description = "Command to SSH into the instance."
  value       = "ssh -i /path/to/${var.ssh_key_name}.pem ${var.ssh_user}@${aws_eip.app.public_ip}"
}

output "vpc_id" {
  description = "ID of the VPC created for this deployment."
  value       = aws_vpc.main.id
}

output "security_group_id" {
  description = "ID of the security group attached to the EC2 instance."
  value       = aws_security_group.app.id
}
