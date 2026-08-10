import type { Service } from "../types/service";
import { ServiceCard } from "./ServiceCard";

interface ServiceListProps {
  services: Service[];
}

export function ServiceList({ services }: ServiceListProps): JSX.Element {
  if (services.length === 0) {
    return <p className="empty-state">No services yet. Add one below to get started.</p>;
  }

  return (
    <ul className="service-list">
      {services.map((service) => (
        <ServiceCard key={service.id} service={service} />
      ))}
    </ul>
  );
}
