export class AppError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
export class ValidationError extends AppError {
  constructor(message: string) { super(422, 'VALIDATION_ERROR', message); }
}
export class NotFoundError extends AppError {
  constructor(message = 'Record not found') { super(404, 'NOT_FOUND', message); }
}
export class ConflictError extends AppError {
  constructor(message: string) { super(409, 'CONFLICT', message); }
}
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission for this action') { super(403, 'FORBIDDEN', message); }
}
export class UnauthorizedError extends AppError {
  constructor() { super(401, 'UNAUTHORIZED', 'Sign in to continue'); }
}
export class BusinessRuleError extends AppError {
  constructor(code: string, message: string) { super(422, code, message); }
}