import type { FastifyInstance, preHandlerHookHandler } from 'fastify';

/**
 * Rotas que podem ser chamadas SEM login. Qualquer rota fora desta lista precisa ter o `authenticate`
 * no `preHandler`; se não tiver, a API NÃO SOBE. Assim, esquecer o login numa rota nova é impossível por engano.
 */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  'GET /health',
  'POST /v1/auth/register',
  'POST /v1/auth/login',
  'POST /v1/auth/social',
  'POST /v1/auth/refresh',
  'POST /v1/auth/logout',
]);

export interface RouteInfo {
  method: string;
  url: string;
  public: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Todas as rotas registradas (usado pelo teste da matriz de autorização). */
    routeTable: RouteInfo[];
  }
}

/** Instala o guard ANTES de registrar as rotas (o hook só vê rotas registradas depois dele). */
export function installRouteGuard(app: FastifyInstance, authenticate: preHandlerHookHandler, publicRoutes: ReadonlySet<string> = PUBLIC_ROUTES) {
  app.decorate('routeTable', [] as RouteInfo[]);
  app.addHook('onRoute', (route) => {
    const methods = (Array.isArray(route.method) ? route.method : [route.method]).filter((m) => m !== 'HEAD' && m !== 'OPTIONS');
    const pre = route.preHandler;
    const handlers = Array.isArray(pre) ? pre : pre ? [pre] : [];
    const authenticated = handlers.includes(authenticate);
    for (const method of methods) {
      const isPublic = publicRoutes.has(`${method} ${route.url}`);
      if (!authenticated && !isPublic) {
        throw new Error(`Rota sem autenticação e fora da lista pública: ${method} ${route.url}`);
      }
      app.routeTable.push({ method, url: route.url, public: isPublic && !authenticated });
    }
  });
}
