export type ServiceStatus = "OPERATIONAL" | "DEGRADED" | "OUTAGE" | "MAINTENANCE";

export interface Service {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceInput {
  name: string;
  description?: string;
  url?: string;
  status?: ServiceStatus;
}
