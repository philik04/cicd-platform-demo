import { describe, expect, it } from "vitest";
import { createServiceSchema, serviceIdParamSchema, updateServiceSchema } from "../schemas/service.schema";

describe("createServiceSchema", () => {
  it("accepts a valid payload", () => {
    const result = createServiceSchema.safeParse({
      name: "API Gateway",
      description: "Public API gateway",
      url: "https://api.example.com",
      status: "OPERATIONAL",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a payload with only a name", () => {
    const result = createServiceSchema.safeParse({ name: "Minimal Service" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = createServiceSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing name", () => {
    const result = createServiceSchema.safeParse({ description: "no name" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid url", () => {
    const result = createServiceSchema.safeParse({ name: "Bad URL Service", url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid status", () => {
    const result = createServiceSchema.safeParse({ name: "Bad Status", status: "BROKEN" });
    expect(result.success).toBe(false);
  });

  it("rejects a name longer than 120 characters", () => {
    const result = createServiceSchema.safeParse({ name: "a".repeat(121) });
    expect(result.success).toBe(false);
  });
});

describe("updateServiceSchema", () => {
  it("accepts a partial payload", () => {
    const result = updateServiceSchema.safeParse({ status: "OUTAGE" });
    expect(result.success).toBe(true);
  });

  it("accepts an empty payload", () => {
    const result = updateServiceSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("serviceIdParamSchema", () => {
  it("accepts a valid UUID", () => {
    const result = serviceIdParamSchema.safeParse({ id: "123e4567-e89b-12d3-a456-426614174000" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID id", () => {
    const result = serviceIdParamSchema.safeParse({ id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});
