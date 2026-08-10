import type { NextFunction, Request, Response } from "express";
import { AppError, ValidationError } from "../lib/errors";
import { logger } from "../lib/logger";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
}

// Express identifies error-handling middleware by arity (4 params), so
// `_next` must stay even though it is unused.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ValidationError) {
    res.status(err.statusCode).json({
      error: { message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { message: err.message },
    });
    return;
  }

  const error = err instanceof Error ? err : new Error("Unknown error");
  logger.error({ err: error, path: req.path, method: req.method }, "Unhandled error");

  res.status(500).json({
    error: { message: "Internal server error" },
  });
}
