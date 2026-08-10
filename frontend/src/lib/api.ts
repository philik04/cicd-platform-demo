import type { CreateServiceInput, Service } from "../types/service";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export class ApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body?.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.json();
  return body.data as T;
}

export const api = {
  getServices: (): Promise<Service[]> => request<Service[]>("/services"),
  getService: (id: string): Promise<Service> => request<Service>(`/services/${id}`),
  createService: (input: CreateServiceInput): Promise<Service> =>
    request<Service>("/services", { method: "POST", body: JSON.stringify(input) }),
};
