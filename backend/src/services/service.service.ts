import { prisma } from "../lib/prisma";
import { NotFoundError } from "../lib/errors";
import type { CreateServiceInput, UpdateServiceInput } from "../schemas/service.schema";

export async function listServices() {
  return prisma.service.findMany({ orderBy: { name: "asc" } });
}

export async function getServiceById(id: string) {
  const service = await prisma.service.findUnique({ where: { id } });

  if (!service) {
    throw new NotFoundError("Service");
  }

  return service;
}

export async function createService(input: CreateServiceInput) {
  return prisma.service.create({ data: input });
}

export async function updateService(id: string, input: UpdateServiceInput) {
  await getServiceById(id);
  return prisma.service.update({ where: { id }, data: input });
}

export async function deleteService(id: string): Promise<void> {
  await getServiceById(id);
  await prisma.service.delete({ where: { id } });
}
