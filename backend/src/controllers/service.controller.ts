import type { Request, Response } from "express";
import * as serviceService from "../services/service.service";
import { createServiceSchema, serviceIdParamSchema, updateServiceSchema } from "../schemas/service.schema";
import { ValidationError } from "../lib/errors";

export async function getServices(_req: Request, res: Response): Promise<void> {
  const services = await serviceService.listServices();
  res.status(200).json({ data: services });
}

export async function getService(req: Request, res: Response): Promise<void> {
  const params = serviceIdParamSchema.safeParse(req.params);
  if (!params.success) {
    throw new ValidationError("Invalid service id", params.error.flatten().fieldErrors);
  }

  const service = await serviceService.getServiceById(params.data.id);
  res.status(200).json({ data: service });
}

export async function postService(req: Request, res: Response): Promise<void> {
  const body = createServiceSchema.safeParse(req.body);
  if (!body.success) {
    throw new ValidationError("Invalid service payload", body.error.flatten().fieldErrors);
  }

  const service = await serviceService.createService(body.data);
  res.status(201).json({ data: service });
}

export async function patchService(req: Request, res: Response): Promise<void> {
  const params = serviceIdParamSchema.safeParse(req.params);
  if (!params.success) {
    throw new ValidationError("Invalid service id", params.error.flatten().fieldErrors);
  }

  const body = updateServiceSchema.safeParse(req.body);
  if (!body.success) {
    throw new ValidationError("Invalid service payload", body.error.flatten().fieldErrors);
  }

  const service = await serviceService.updateService(params.data.id, body.data);
  res.status(200).json({ data: service });
}

export async function removeService(req: Request, res: Response): Promise<void> {
  const params = serviceIdParamSchema.safeParse(req.params);
  if (!params.success) {
    throw new ValidationError("Invalid service id", params.error.flatten().fieldErrors);
  }

  await serviceService.deleteService(params.data.id);
  res.status(204).send();
}
