import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { AuthController } from './auth.controller.js';
import type { UserController } from './user.controller.js';

export interface UserRoutesDeps {
  authController: AuthController;
  userController: UserController;
  authenticate: preHandlerHookHandler;
  authRateLimitMax: number;
}

export async function userRoutes(app: FastifyInstance, deps: UserRoutesDeps) {
  const { authController, userController, authenticate, authRateLimitMax } = deps;

  // Limite mais agressivo nas rotas de credenciais (força bruta / credential stuffing)
  const strictRateLimit = { rateLimit: { max: authRateLimitMax, timeWindow: '1 minute' } };

  app.post('/auth/register', { config: strictRateLimit }, authController.register);
  app.post('/auth/login', { config: strictRateLimit }, authController.login);
  app.post('/auth/social', { config: strictRateLimit }, authController.social);
  app.post('/auth/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, authController.refresh);
  app.post('/auth/logout', authController.logout);

  app.get('/users/me', { preHandler: authenticate }, userController.me);
  app.patch('/users/me', { preHandler: authenticate }, userController.updateMe);
}
