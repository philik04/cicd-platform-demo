import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddServiceForm } from "../components/AddServiceForm";

describe("AddServiceForm", () => {
  it("shows a validation error when submitting without a name", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<AddServiceForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: /add service/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/name is required/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with the entered values and resets the form", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<AddServiceForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/name/i), "Notification Service");
    await user.type(screen.getByLabelText(/description/i), "Sends emails");
    await user.selectOptions(screen.getByLabelText(/status/i), "DEGRADED");
    await user.click(screen.getByRole("button", { name: /add service/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Notification Service",
        description: "Sends emails",
        status: "DEGRADED",
      }),
    );

    expect(screen.getByLabelText(/name/i)).toHaveValue("");
  });

  it("surfaces an error message when onSubmit rejects", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Network error"));
    const user = userEvent.setup();

    render(<AddServiceForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/name/i), "Broken Service");
    await user.click(screen.getByRole("button", { name: /add service/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network error");
  });
});
