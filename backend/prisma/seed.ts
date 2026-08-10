import { PrismaClient, ServiceStatus } from "@prisma/client";

const prisma = new PrismaClient();

const seedServices = [
  {
    name: "API Gateway",
    description: "Public-facing API gateway routing traffic to internal services",
    url: "https://api.example.com",
    status: ServiceStatus.OPERATIONAL,
  },
  {
    name: "Authentication Service",
    description: "Handles user authentication and session management",
    url: "https://auth.example.com",
    status: ServiceStatus.OPERATIONAL,
  },
  {
    name: "Payments Processor",
    description: "Processes payment transactions and refunds",
    url: "https://payments.example.com",
    status: ServiceStatus.DEGRADED,
  },
  {
    name: "Notification Service",
    description: "Sends email and push notifications to users",
    url: "https://notifications.example.com",
    status: ServiceStatus.OPERATIONAL,
  },
  {
    name: "Reporting Pipeline",
    description: "Nightly batch job generating analytics reports",
    url: "https://reports.example.com",
    status: ServiceStatus.MAINTENANCE,
  },
];

async function main(): Promise<void> {
  console.log("Seeding database...");

  await prisma.service.deleteMany();
  await prisma.service.createMany({ data: seedServices });

  console.log(`Seeded ${seedServices.length} services.`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
