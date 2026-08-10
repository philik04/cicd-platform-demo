import { Router } from "express";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

export const healthRouter = Router();

const startedAt = Date.now();

/**
 * Health probe: reports both application-level health (process uptime,
 * memory) and database connectivity/latency. This is the endpoint humans
 * and dashboards hit to understand overall system health.
 */
healthRouter.get("/health", async (_req, res) => {
  const dbStart = Date.now();
  let database: { status: "up" | "down"; latencyMs: number } = { status: "down", latencyMs: 0 };

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { status: "up", latencyMs: Date.now() - dbStart };
  } catch (error) {
    database = { status: "down", latencyMs: Date.now() - dbStart };
    logger.error({ err: error }, "Health check: database unreachable");
  }

  const memory = process.memoryUsage();
  const overallStatus = database.status === "up" ? "ok" : "degraded";

  res.status(database.status === "up" ? 200 : 503).json({
    status: overallStatus,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "development",
    memory: {
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    },
    checks: {
      database,
    },
  });
});

/**
 * Readiness probe: a minimal, fast gate used by orchestrators / load
 * balancers to decide whether to route traffic to this instance. Kept
 * separate from /health so it can be polled frequently and cheaply.
 */
healthRouter.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ready", timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error({ err: error }, "Readiness check failed: database unreachable");
    res.status(503).json({ status: "not_ready", timestamp: new Date().toISOString() });
  }
});
