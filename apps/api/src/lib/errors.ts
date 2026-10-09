/**
 * Application errors. Services throw these; only `app.onError` maps them to HTTP responses.
 * They carry no HTTP status on purpose — see `errorStatus` in app.ts.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request') {
    super('validation_error', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super('not_found', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not allowed') {
    super('forbidden', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super('conflict', message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Daily limit reached — try again tomorrow') {
    super('rate_limited', message);
  }
}
