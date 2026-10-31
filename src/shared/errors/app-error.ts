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

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado') {
    super('NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflito') {
    super('CONFLICT', message);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Serviço indisponível') {
    super('UNAVAILABLE', message);
  }
}
