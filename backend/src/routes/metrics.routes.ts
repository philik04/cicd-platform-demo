import { Router } from "express";
import { prisma } from "../lib/prisma";

export const metricsRouter = Router();

const startedAt = Date.now();
let requestCount = 0;

export function incrementRequestCount(): void {
  requestCount += 1;
}

/**
 * Minimal Prometheus-style metrics endpoint. Deliberately small in scope —
 * this project focuses on CI/CD, not a full observability stack.
 */
metricsRouter.get("/metrics", async (_req, res) => {
  const memory = process.memoryUsage();
  const serviceCount = await prisma.service.count().catch(() => -1);

  const lines = [
    "# HELP app_uptime_seconds Process uptime in seconds",
    "# TYPE app_uptime_seconds gauge",
    `app_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1000)}`,
    "# HELP app_requests_total Total HTTP requests handled since start",
    "# TYPE app_requests_total counter",
    `app_requests_total ${requestCount}`,
    "# HELP app_memory_rss_bytes Resident set size in bytes",
    "# TYPE app_memory_rss_bytes gauge",
    `app_memory_rss_bytes ${memory.rss}`,
    "# HELP app_services_total Total number of services tracked in the database",
    "# TYPE app_services_total gauge",
    `app_services_total ${serviceCount}`,
  ];

  res.setHeader("Content-Type", "text/plain; version=0.0.4");
  res.status(200).send(lines.join("\n") + "\n");
});
