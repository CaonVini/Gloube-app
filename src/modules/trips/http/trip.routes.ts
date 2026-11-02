import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { TripController } from './trip.controller.js';

export async function tripRoutes(app: FastifyInstance, deps: { tripController: TripController; authenticate: preHandlerHookHandler }) {
  const { tripController: c, authenticate } = deps;
  const auth = { preHandler: authenticate };
  // Geração de roteiro é a operação mais cara: limite próprio por IP
  const heavy = { preHandler: authenticate, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.post('/trips', auth, c.create);
  app.get('/trips', auth, c.list);
  app.get('/trips/:id', auth, c.get);
  app.patch('/trips/:id', auth, c.update);
  app.post('/trips/:id/status', auth, c.status);
  app.post('/trips/:id/archive', auth, c.archive);
  app.delete('/trips/:id/archive', auth, c.unarchive);
  app.post('/trips/:id/itinerary/generate', heavy, c.generate);
  // Não existe DELETE /trips/:id de propósito: viagens só são arquivadas.
}
