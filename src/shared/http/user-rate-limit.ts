import type { FastifyRequest, preHandlerHookHandler } from 'fastify';
import { RateLimitedError } from '../errors/app-error.js';

// No @fastify/rate-limit, `isAllowed` só é true para allowList; quem estourou o teto é `isExceeded`.
type Limiter = (req: FastifyRequest) => Promise<{ isAllowed?: boolean; isExceeded?: boolean; ttlInSeconds?: number }>;

/**
 * Limite por USUÁRIO (não por IP): roda depois do login, então a chave é o `userId` do token.
 * Isso impede que uma conta sozinha (ou um token vazado) esgote a API, e que várias pessoas atrás do mesmo
 * IP (rede móvel/Wi-Fi compartilhado) se bloqueiem entre si. O limite por IP continua valendo, antes do login.
 * O contador fica em memória do processo; com várias instâncias, troque o store do @fastify/rate-limit por Redis.
 */
export function withUserRateLimit(authenticate: preHandlerHookHandler, limiter: Limiter): preHandlerHookHandler {
  const wrapped: preHandlerHookHandler = async function (this: unknown, request, reply) {
    await (authenticate as (this: unknown, ...a: unknown[]) => unknown).call(this, request, reply);
    const { isExceeded, ttlInSeconds } = await limiter(request);
    if (isExceeded) {
      void reply.header('retry-after', String(ttlInSeconds ?? 60));
      throw new RateLimitedError('Muitas requisições. Tente novamente em instantes.');
    }
  };
  return wrapped;
}
