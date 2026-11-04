// Errores de dominio: se lanzan y el handler global los traduce a { error: { code, message } }.
export class AppError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code: string) {
    super(message);
  }
}
export class ValidationError extends AppError {
  constructor(message: string) { super(message, 400, 'VALIDATION'); }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Tu sesión venció, ingresá de nuevo') { super(message, 401, 'UNAUTHORIZED'); }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Tu usuario no tiene permiso para esto') { super(message, 403, 'FORBIDDEN'); }
}
export class NotFoundError extends AppError {
  constructor(message = 'No lo encontramos') { super(message, 404, 'NOT_FOUND'); }
}
export class ConflictError extends AppError {
  constructor(message: string) { super(message, 409, 'CONFLICT'); }
}
