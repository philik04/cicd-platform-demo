import { useState, type FormEvent } from "react";
import type { CreateServiceInput, ServiceStatus } from "../types/service";

interface AddServiceFormProps {
  onSubmit: (input: CreateServiceInput) => Promise<void>;
}

const STATUS_OPTIONS: ServiceStatus[] = ["OPERATIONAL", "DEGRADED", "OUTAGE", "MAINTENANCE"];

export function AddServiceForm({ onSubmit }: AddServiceFormProps): JSX.Element {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ServiceStatus>("OPERATIONAL");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Service name is required.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), description: description.trim() || undefined, status });
      setName("");
      setDescription("");
      setStatus("OPERATIONAL");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to add service.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="add-service-form" onSubmit={handleSubmit}>
      <h2>Add a service</h2>

      <label htmlFor="service-name">Name</label>
      <input
        id="service-name"
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="e.g. Billing Service"
      />

      <label htmlFor="service-description">Description</label>
      <input
        id="service-description"
        type="text"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Optional"
      />

      <label htmlFor="service-status">Status</label>
      <select
        id="service-status"
        value={status}
        onChange={(event) => setStatus(event.target.value as ServiceStatus)}
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting}>
        {submitting ? "Adding..." : "Add service"}
      </button>
    </form>
  );
}
