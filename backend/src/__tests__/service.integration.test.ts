import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

const testServiceName = "Integration Test Service";

beforeAll(async () => {
  // Clean up any leftovers from a previous failed run.
  await prisma.service.deleteMany({ where: { name: { startsWith: "Integration Test" } } });
});

afterAll(async () => {
  await prisma.service.deleteMany({ where: { name: { startsWith: "Integration Test" } } });
});

describe("Service API", () => {
  let createdId: string;

  it("creates a service via POST /api/services", async () => {
    const response = await request(app)
      .post("/api/services")
      .send({ name: testServiceName, description: "Created by integration test", status: "OPERATIONAL" });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ name: testServiceName, status: "OPERATIONAL" });
    expect(response.body.data.id).toEqual(expect.any(String));

    createdId = response.body.data.id;
  });

  it("rejects an invalid payload with 400", async () => {
    const response = await request(app).post("/api/services").send({ name: "" });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBeDefined();
  });

  it("lists services via GET /api/services, including the created one", async () => {
    const response = await request(app).get("/api/services");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.some((service: { id: string }) => service.id === createdId)).toBe(true);
  });

  it("fetches a single service via GET /api/services/:id", async () => {
    const response = await request(app).get(`/api/services/${createdId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(createdId);
  });

  it("returns 404 for a non-existent (but valid) UUID", async () => {
    const response = await request(app).get("/api/services/123e4567-e89b-12d3-a456-426614174000");
    expect(response.status).toBe(404);
  });

  it("returns 400 for a malformed id", async () => {
    const response = await request(app).get("/api/services/not-a-uuid");
    expect(response.status).toBe(400);
  });

  it("updates a service via PATCH /api/services/:id", async () => {
    const response = await request(app).patch(`/api/services/${createdId}`).send({ status: "OUTAGE" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("OUTAGE");
  });

  it("deletes a service via DELETE /api/services/:id", async () => {
    const response = await request(app).delete(`/api/services/${createdId}`);
    expect(response.status).toBe(204);

    const followUp = await request(app).get(`/api/services/${createdId}`);
    expect(followUp.status).toBe(404);
  });
});
