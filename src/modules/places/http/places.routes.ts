import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { PlacesController } from './places.controller.js';

export async function placesRoutes(app: FastifyInstance, deps: { placesController: PlacesController; authenticate: preHandlerHookHandler; placesRateLimitMax: number }) {
  // Cada chamada custa dinheiro no Google: limite próprio, bem abaixo do global
  const opts = { preHandler: deps.authenticate, config: { rateLimit: { max: deps.placesRateLimitMax, timeWindow: '1 minute' } } };
  app.get('/places/destinations', opts, deps.placesController.destinations);
  app.get('/places/attractions', opts, deps.placesController.attractions);
}
