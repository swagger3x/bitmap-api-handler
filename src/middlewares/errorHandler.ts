import { Request, Response, NextFunction } from "express";
import { CustomError } from "../utils/errors";

export const errorHandler = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal Server Error";

  // Full stack traces only for server errors; expected 4xx (scanner probes,
  // bad requests) get a one-liner so they don't bury real problems in the logs.
  if (statusCode >= 500) {
    console.error(error);
  } else {
    console.warn(
      `[http] ${statusCode} ${req.method} ${req.originalUrl} — ${message}`,
    );
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  });
};

export const notFound = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const error: CustomError = new CustomError(
    `Not found - ${req.originalUrl}`,
    404
  );
  next(error);
};
