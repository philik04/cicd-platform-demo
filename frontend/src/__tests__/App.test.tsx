import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "../App";
import { api } from "../lib/api";
import type { Service } from "../types/service";

vi.mock("../lib/api", () => ({
  api: {
    getServices: vi.fn(),
    createService: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

const mockedApi = vi.mocked(api);

const services: Service[] = [
  {
    id: "1",
    name: "API Gateway",
    description: null,
    url: null,
    status: "OPERATIONAL",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe("App", () => {
  it("loads and displays services on mount", async () => {
    mockedApi.getServices.mockResolvedValue(services);

    render(<App />);

    expect(screen.getByText(/loading services/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("API Gateway")).toBeInTheDocument());
  });

  it("shows an error message when loading services fails", async () => {
    mockedApi.getServices.mockRejectedValue(new Error("Failed to load services."));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/failed to load services/i);
  });
});
