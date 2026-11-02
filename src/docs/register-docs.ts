import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { buildOpenApiDocument } from './openapi.js';

/**
 * Documentação interativa em /docs (e o JSON em /docs/json). Fica desligada em produção por padrão
 * (DOCS_ENABLED=true liga): ela expõe o mapa completo da API. Registre ANTES do guard de rotas.
 */
export async function registerDocs(app: FastifyInstance) {
  await app.register(swagger, { mode: 'static', specification: { document: buildOpenApiDocument() as never } });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', persistAuthorization: false, tryItOutEnabled: true },
    staticCSP: true,
    // O swagger-ui aplica estilos inline: liberamos SÓ nas rotas /docs (a API em si mantém o CSP estrito do helmet)
    transformStaticCSP: (header) => header.replace("style-src 'self' https:", "style-src 'self' https: 'unsafe-inline'"),
    theme: { title: 'Gloube API' },
  });
}
