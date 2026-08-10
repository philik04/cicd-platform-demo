import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./lib/api";
import type { CreateServiceInput, Service } from "./types/service";
import { ServiceList } from "./components/ServiceList";
import { AddServiceForm } from "./components/AddServiceForm";

export function App(): JSX.Element {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getServices();
      setServices(data);
    } catch (fetchError) {
      setError(fetchError instanceof ApiError ? fetchError.message : "Failed to load services.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  async function handleCreate(input: CreateServiceInput): Promise<void> {
    const created = await api.createService(input);
    setServices((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>Service Status Dashboard</h1>
        <p>Live status overview for internal services.</p>
      </header>

      <main className="app__main">
        <section aria-labelledby="services-heading">
          <h2 id="services-heading">Services</h2>

          {loading && <p>Loading services...</p>}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && <ServiceList services={services} />}
        </section>

        <section aria-labelledby="add-service-heading">
          <AddServiceForm onSubmit={handleCreate} />
        </section>
      </main>
    </div>
  );
}
