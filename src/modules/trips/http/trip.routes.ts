import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { TripController } from './trip.controller.js';

export async function tripRoutes(app: FastifyInstance, deps: { tripController: TripController; authenticate: preHandlerHookHandler }) {
  const { tripController: c, authenticate } = deps;
  const auth = { preHandler: authenticate };

  app.post('/trips', auth, c.create);
  app.get('/trips', auth, c.list);
  app.get('/trips/:id', auth, c.get);
  app.patch('/trips/:id', auth, c.update);
  app.post('/trips/:id/status', auth, c.status);
  app.post('/trips/:id/archive', auth, c.archive);
  app.delete('/trips/:id/archive', auth, c.unarchive);
  // Não existe DELETE /trips/:id de propósito: viagens só são arquivadas.
}
