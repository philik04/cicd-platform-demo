import type { ServiceStatus } from "../types/service";

const STATUS_LABELS: Record<ServiceStatus, string> = {
  OPERATIONAL: "Operational",
  DEGRADED: "Degraded",
  OUTAGE: "Outage",
  MAINTENANCE: "Maintenance",
};

interface StatusBadgeProps {
  status: ServiceStatus;
}

export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  return (
    <span className={`status-badge status-badge--${status.toLowerCase()}`} role="status">
      {STATUS_LABELS[status]}
    </span>
  );
}
