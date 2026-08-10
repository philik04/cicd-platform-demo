import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";

const app = createApp();

describe("GET /api/health", () => {
  it("returns application and database health information", async () => {
    const response = await request(app).get("/api/health");

    expect([200, 503]).toContain(response.status);
    expect(response.body).toMatchObject({
      status: expect.any(String),
      uptimeSeconds: expect.any(Number),
      environment: expect.any(String),
      checks: {
        database: {
          status: expect.stringMatching(/^(up|down)$/),
          latencyMs: expect.any(Number),
        },
      },
    });
  });
});

describe("GET /api/ready", () => {
  it("returns a readiness status", async () => {
    const response = await request(app).get("/api/ready");
    expect([200, 503]).toContain(response.status);
    expect(response.body.status).toMatch(/^(ready|not_ready)$/);
  });
});

describe("GET /api/metrics", () => {
  it("returns Prometheus-formatted metrics text", async () => {
    const response = await request(app).get("/api/metrics");

    expect(response.status).toBe(200);
    expect(response.text).toContain("app_uptime_seconds");
    expect(response.text).toContain("app_requests_total");
  });
});

describe("unknown routes", () => {
  it("returns a 404 with a JSON error body", async () => {
    const response = await request(app).get("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.error.message).toContain("not found");
  });
});
