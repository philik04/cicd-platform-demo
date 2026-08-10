import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServiceList } from "../components/ServiceList";
import type { Service } from "../types/service";

const baseService: Service = {
  id: "1",
  name: "API Gateway",
  description: "Routes public traffic",
  url: "https://api.example.com",
  status: "OPERATIONAL",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("ServiceList", () => {
  it("shows an empty state when there are no services", () => {
    render(<ServiceList services={[]} />);
    expect(screen.getByText(/no services yet/i)).toBeInTheDocument();
  });

  it("renders one card per service", () => {
    const services: Service[] = [
      baseService,
      { ...baseService, id: "2", name: "Payments", status: "DEGRADED" },
    ];

    render(<ServiceList services={services} />);

    expect(screen.getAllByTestId("service-card")).toHaveLength(2);
    expect(screen.getByText("API Gateway")).toBeInTheDocument();
    expect(screen.getByText("Payments")).toBeInTheDocument();
  });
});
