import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { AuthController } from './auth.controller.js';
import multipart from '@fastify/multipart';
import type { UserController } from './user.controller.js';
import type { AvatarController } from './avatar.controller.js';

export interface UserRoutesDeps {
  authController: AuthController;
  userController: UserController;
  avatarController: AvatarController;
  authenticate: preHandlerHookHandler;
  authRateLimitMax: number;
  uploadRateLimitMax: number;
}

export async function userRoutes(app: FastifyInstance, deps: UserRoutesDeps) {
  const { authController, userController, avatarController, authenticate, authRateLimitMax, uploadRateLimitMax } = deps;

  // Limite mais agressivo nas rotas de credenciais (força bruta / credential stuffing)
  const strictRateLimit = { rateLimit: { max: authRateLimitMax, timeWindow: '1 minute' } };

  app.post('/auth/register', { config: strictRateLimit }, authController.register);
  app.post('/auth/login', { config: strictRateLimit }, authController.login);
  app.post('/auth/social', { config: strictRateLimit }, authController.social);
  app.post('/auth/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, authController.refresh);
  app.post('/auth/logout', authController.logout);

  app.get('/users/me', { preHandler: authenticate }, userController.me);
  app.patch('/users/me', { preHandler: authenticate }, userController.updateMe);

  // Upload em contexto próprio: o parser multipart só existe nesta rota e a autenticação roda ANTES de ler o corpo
  await app.register(async (scope) => {
    await scope.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } });
    const uploadLimit = { rateLimit: { max: uploadRateLimitMax, timeWindow: '1 minute' } };
    scope.put('/users/me/avatar', { preHandler: authenticate, config: uploadLimit }, avatarController.put);
    scope.delete('/users/me/avatar', { preHandler: authenticate, config: uploadLimit }, avatarController.remove);
  });
}
