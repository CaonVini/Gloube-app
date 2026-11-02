import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { AiController } from './ai.controller.js';

export async function aiRoutes(app: FastifyInstance, deps: { aiController: AiController; authenticate: preHandlerHookHandler; aiRateLimitMax: number }) {
  const { aiController: c, authenticate, aiRateLimitMax } = deps;
  const auth = { preHandler: authenticate };
  // Operação que gasta dinheiro: limite próprio por minuto (além do teto diário por usuário)
  const costly = { preHandler: authenticate, config: { rateLimit: { max: aiRateLimitMax, timeWindow: '1 minute' } } };

  app.post('/trips/:id/itinerary/ai', costly, c.generate);
  app.get('/trips/:id/generations', auth, c.listTrip);
  app.get('/ai/generations/:generationId', auth, c.get);
  app.get('/users/me/ai-usage', auth, c.usage);
}
