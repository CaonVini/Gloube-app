/**
 * Erros de aplicação são agnósticos de HTTP: carregam um `code` semântico.
 * A camada HTTP (error-handler) é quem traduz `code` -> status code.
 */
export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAVAILABLE';

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autorizado') {
    super('UNAUTHORIZED', message);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Dados inválidos', details?: unknown) {
    super('VALIDATION_ERROR', message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado') {
    super('NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflito', details?: unknown) {
    super('CONFLICT', message, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Serviço indisponível') {
    super('UNAVAILABLE', message);
  }
}
