import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { serviceRouter } from "./routes/service.routes";
import { healthRouter } from "./routes/health.routes";
import { metricsRouter, incrementRequestCount } from "./routes/metrics.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp(): Express {
  const app = express();

  // Security headers (CSP, HSTS, X-Frame-Options, etc.)
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "PATCH", "DELETE"],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "100kb" }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: env.NODE_ENV !== "test",
    }),
  );

  app.use((_req, _res, next) => {
    incrementRequestCount();
    next();
  });

  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api", limiter);

  app.use("/api", healthRouter);
  app.use("/api", metricsRouter);
  app.use("/api/services", serviceRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
