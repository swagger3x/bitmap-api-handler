export class CustomError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends CustomError {
  constructor(message: string = "Resource not found") {
    super(message, 404);
  }
}

export class ValidationError extends CustomError {
  constructor(message: string = "Validation failed") {
    super(message, 400);
  }
}

export class ExternalApiError extends CustomError {
  constructor(message: string = "External API error") {
    super(message, 502);
  }
}

export class DatabaseError extends CustomError {
  constructor(message: string = "Database error") {
    super(message);
  }
}
