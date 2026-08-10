import { z } from "zod";

export const serviceStatusEnum = z.enum(["OPERATIONAL", "DEGRADED", "OUTAGE", "MAINTENANCE"]);

export const createServiceSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120, "name must be 120 characters or fewer"),
  description: z.string().trim().max(500).optional(),
  url: z.string().trim().url("url must be a valid URL").optional(),
  status: serviceStatusEnum.optional(),
});

export const updateServiceSchema = createServiceSchema.partial();

export const serviceIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
