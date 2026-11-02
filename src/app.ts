import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { sql } from 'drizzle-orm';
import type { Env } from './config/env.js';
import type { Database } from './infra/database/client.js';
import { buildContainer, type ContainerOverrides } from './shared/container.js';
import { errorHandler } from './shared/http/error-handler.js';
import { userRoutes } from './modules/users/http/user.routes.js';

export async function buildApp(env: Env, db: Database, overrides: ContainerOverrides = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
      // Nunca logar credenciais
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 100 * 1024, // 100 KB: suficiente para JSON de API, barra payloads abusivos
    requestTimeout: 30_000,
  });

  app.decorateRequest('userId', '');

  await app.register(helmet, { global: true });
  await app.register(cors, {
    // App mobile nativo não envia Origin; se a lista estiver vazia, CORS fica desligado para browsers.
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
  });
  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Rota ${request.method} ${request.url} não encontrada` } }),
  );

  app.get('/health', { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });

  const container = buildContainer(env, db, overrides);
  await app.register((instance) => userRoutes(instance, { ...container, authRateLimitMax: env.AUTH_RATE_LIMIT_MAX, uploadRateLimitMax: env.UPLOAD_RATE_LIMIT_MAX }), { prefix: '/v1' });

  return app;
}
