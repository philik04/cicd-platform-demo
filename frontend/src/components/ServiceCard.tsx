import type { Service } from "../types/service";
import { StatusBadge } from "./StatusBadge";

interface ServiceCardProps {
  service: Service;
}

export function ServiceCard({ service }: ServiceCardProps): JSX.Element {
  return (
    <li className="service-card" data-testid="service-card">
      <div className="service-card__header">
        <h3>{service.name}</h3>
        <StatusBadge status={service.status} />
      </div>
      {service.description && <p className="service-card__description">{service.description}</p>}
      {service.url && (
        <a className="service-card__link" href={service.url} target="_blank" rel="noreferrer">
          {service.url}
        </a>
      )}
    </li>
  );
}
