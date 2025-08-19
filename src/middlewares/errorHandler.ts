import { Request, Response, NextFunction } from "express";
import { CustomError } from "../utils/errors";

export const errorHandler = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error(error);

  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal Server Error";

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
