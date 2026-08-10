import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../components/StatusBadge";

describe("StatusBadge", () => {
  it("renders a human-readable label for each status", () => {
    render(<StatusBadge status="OPERATIONAL" />);
    expect(screen.getByText("Operational")).toBeInTheDocument();
  });

  it("applies a status-specific class name", () => {
    render(<StatusBadge status="OUTAGE" />);
    expect(screen.getByRole("status")).toHaveClass("status-badge--outage");
  });
});
