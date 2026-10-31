import type { preHandlerHookHandler } from 'fastify';
import { UnauthorizedError } from '../errors/app-error.js';
import type { AccessTokenService } from '../../modules/users/application/ports/access-token-service.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

/** preHandler que exige `Authorization: Bearer <jwt>` e popula `request.userId`. */
export function makeAuthenticate(tokens: AccessTokenService): preHandlerHookHandler {
  return async (request) => {
    const header = request.headers.authorization;
    if (!header) throw new UnauthorizedError('Token não informado');

    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedError('Formato de token inválido');
    }

    const payload = await tokens.verify(token);
    request.userId = payload.sub;
  };
}
