import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, type AppErrorCode } from '../errors/app-error.js';

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNAVAILABLE: 503,
};

/**
 * Tratamento centralizado de erros. Formato único de resposta:
 * { error: { code, message, details? } }
 * Erros inesperados viram 500 genérico (sem stack/mensagem interna para o cliente).
 */
export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(STATUS_BY_CODE[error.code]).send({
      error: { code: error.code, message: error.message, details: error.details },
    });
  }

  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados de entrada inválidos',
        details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  // Erros do próprio Fastify com status 4xx (JSON malformado, payload grande, rate limit...)
  const statusCode = (error as FastifyError).statusCode;
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return reply.status(statusCode).send({
      error: { code: (error as FastifyError).code ?? 'BAD_REQUEST', message: error.message },
    });
  }

  request.log.error({ err: error }, 'erro não tratado');
  return reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
  });
}
