import { z } from 'zod';
import { loginBodySchema, refreshBodySchema, registerBodySchema, socialLoginBodySchema, updateProfileBodySchema, addressSchema } from '../modules/users/http/user.schemas.js';
import {
  changeStatusBodySchema, createTripBodySchema, generateItineraryBodySchema, replaceItineraryBodySchema, updateTripBodySchema,
} from '../modules/trips/http/trip.schemas.js';
import { enqueueBodySchema } from '../modules/ai/http/ai.schemas.js';
import { TRIP_STATUSES } from '../modules/trips/domain/trip.types.js';

type Json = Record<string, unknown>;

/** Converte um schema zod (a MESMA fonte que valida as requisições) em JSON Schema OpenAPI 3.0. */
const fromZod = (schema: z.ZodType): Json =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', unrepresentable: 'any', io: 'input' }) as Json;

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const str = (extra: Json = {}): Json => ({ type: 'string', ...extra });
const nullable = (s: Json): Json => ({ ...s, nullable: true });
const obj = (properties: Record<string, Json>, required: string[] = Object.keys(properties)): Json => ({ type: 'object', properties, required });

// ---------- Componentes (formas das RESPOSTAS) ----------
const schemas: Record<string, Json> = {
  Error: obj({
    error: obj({ code: str({ example: 'VALIDATION_ERROR' }), message: str(), details: { description: 'Lista de problemas ou dados extras (opcional)' } }, ['code', 'message']),
  }),
  Address: fromZod(addressSchema),
  User: obj({
    id: str({ format: 'uuid' }), name: str(), email: str({ format: 'email' }), phone: nullable(str({ example: '+5511999998888' })),
    address: nullable(ref('Address')), profileComplete: { type: 'boolean', description: 'false quando falta telefone ou endereço' },
    createdAt: str({ format: 'date-time' }),
  }),
  SessionTokens: obj({
    accessToken: str({ description: 'JWT de vida curta (15 min)' }), refreshToken: str({ description: 'Opaco; troque em /auth/refresh (rotaciona a cada uso)' }),
    tokenType: str({ enum: ['Bearer'] }), expiresIn: { type: 'integer', description: 'segundos até o access token expirar', example: 900 },
  }),
  AuthResult: obj({ user: ref('User'), tokens: ref('SessionTokens'), isNewUser: { type: 'boolean', description: 'Só no login social' } }, ['user', 'tokens']),
  Destination: obj({ ref: str({ example: 'google:ChIJD7fiBh9u5kcRYJSMaMOCCwQ' }), city: str({ example: 'Paris' }), country: str({ example: 'França' }) }),
  LikedPlace: obj({
    ref: str(), name: str(), kind: str({ enum: ['icone', 'museu', 'natureza', 'passeio', 'sabor', 'bairro'] }),
    destinationRef: str({ description: '`ref` de um destino da viagem' }),
  }),
  Period: {
    description: 'Datas em AAAA-MM-DD. Nada antes de hoje (fuso de Brasília); a volta é depois da ida.',
    oneOf: [
      obj({ mode: str({ enum: ['indefinido'] }) }),
      obj({ mode: str({ enum: ['mes'] }), month: { type: 'integer', minimum: 1, maximum: 12 }, year: { type: 'integer' } }),
      obj({ mode: str({ enum: ['definidas'] }), startDate: str({ format: 'date' }), endDate: nullable(str({ format: 'date' })) }),
    ],
  },
  ItineraryItem: obj({ id: str({ format: 'uuid' }), text: str({ maxLength: 200 }), placeRef: nullable(str()) }),
  ItineraryDay: obj({ id: str({ format: 'uuid' }), title: str({ maxLength: 120 }), destinationRef: nullable(str()), items: { type: 'array', maxItems: 30, items: ref('ItineraryItem') } }),
  Itinerary: obj({ days: { type: 'array', maxItems: 366, items: ref('ItineraryDay') } }),
  Trip: obj({
    id: str({ format: 'uuid' }), status: str({ enum: [...TRIP_STATUSES] }), archived: { type: 'boolean' }, archivedAt: nullable(str({ format: 'date-time' })),
    origin: nullable(str()), climate: nullable(str({ enum: ['frio', 'calor', 'tanto-faz'] })), reach: nullable(str({ enum: ['perto', 'brasil', 'internacional'] })),
    companion: nullable(str({ enum: ['casal', 'amigos', 'familia', 'solo'] })),
    experiences: { type: 'array', items: str({ enum: ['praia', 'montanha', 'cidade', 'natureza', 'neve'] }) },
    needs: { type: 'array', items: str({ enum: ['criancas', 'idosos', 'acessibilidade', 'pets'] }) },
    destinations: { type: 'array', maxItems: 10, items: ref('Destination') }, likedPlaces: { type: 'array', items: ref('LikedPlace') },
    period: nullable(ref('Period')), days: nullable({ type: 'integer', minimum: 1 }),
    budgetBrl: nullable({ type: 'number', minimum: 0, description: 'Reais por pessoa; null = sem limite definido' }),
    itinerary: nullable(ref('Itinerary')), itineraryRevision: { type: 'integer', description: 'Use em PUT /itinerary para evitar sobrescrever edição de outro aparelho' },
    createdAt: str({ format: 'date-time' }), updatedAt: str({ format: 'date-time' }),
  }),
  TripSummary: obj({
    id: str({ format: 'uuid' }), status: str({ enum: [...TRIP_STATUSES] }), archived: { type: 'boolean' }, origin: nullable(str()),
    destinations: { type: 'array', items: ref('Destination') }, companion: nullable(str()), period: nullable(ref('Period')),
    days: nullable({ type: 'integer' }), budgetBrl: nullable({ type: 'number' }), hasItinerary: { type: 'boolean' },
    createdAt: str({ format: 'date-time' }), updatedAt: str({ format: 'date-time' }),
  }),
  TripList: obj({ items: { type: 'array', items: ref('TripSummary') }, nextCursor: nullable(str({ description: 'Passe em ?cursor= para a próxima página' })) }),
  Generation: obj({
    id: str({ format: 'uuid' }), tripId: str({ format: 'uuid' }), status: str({ enum: ['queued', 'running', 'succeeded', 'failed'] }),
    model: str(), promptVersion: str(), applied: { type: 'boolean', description: 'false = o roteiro foi editado enquanto a IA trabalhava; o resultado não sobrescreveu' },
    errorCode: nullable(str({ enum: ['provider_error', 'provider_timeout', 'invalid_output', 'trip_unavailable', 'worker_timeout'] })),
    inputTokens: nullable({ type: 'integer' }), outputTokens: nullable({ type: 'integer' }),
    costUsd: nullable({ type: 'number', description: 'Custo estimado em USD (tokens x preço configurado)' }), durationMs: nullable({ type: 'integer' }),
    createdAt: str({ format: 'date-time' }), startedAt: nullable(str({ format: 'date-time' })), finishedAt: nullable(str({ format: 'date-time' })),
  }),
  GenerationList: obj({ items: { type: 'array', items: ref('Generation') } }),
  AiUsage: obj({
    generations: { type: 'integer' }, inputTokens: { type: 'integer' }, outputTokens: { type: 'integer' }, costUsd: { type: 'number' },
    today: obj({ generations: { type: 'integer' }, limit: { type: 'integer' } }),
  }),
  EnqueueGenerationBody: fromZod(enqueueBodySchema),
  UserTripStats: obj({ trips: { type: 'integer' }, countries: { type: 'integer' }, places: { type: 'integer' } }),
  RegisterBody: fromZod(registerBodySchema),
  LoginBody: fromZod(loginBodySchema),
  SocialLoginBody: fromZod(socialLoginBodySchema),
  RefreshBody: fromZod(refreshBodySchema),
  UpdateProfileBody: fromZod(updateProfileBodySchema),
  CreateTripBody: fromZod(createTripBodySchema),
  UpdateTripBody: fromZod(updateTripBodySchema),
  ChangeStatusBody: fromZod(changeStatusBodySchema),
  GenerateItineraryBody: fromZod(generateItineraryBodySchema),
  ReplaceItineraryBody: fromZod(replaceItineraryBodySchema),
};

// ---------- Respostas de erro reutilizáveis ----------
const errorResponse = (description: string): Json => ({ description, content: { 'application/json': { schema: ref('Error') } } });
const responses: Record<string, Json> = {
  BadRequest: errorResponse('Dados inválidos (`VALIDATION_ERROR`); `details` lista cada campo'),
  Unauthorized: errorResponse('Token ausente, inválido ou expirado (`UNAUTHORIZED`)'),
  NotFound: errorResponse('Não existe **ou pertence a outro usuário** (`NOT_FOUND`); a API nunca revela a existência de dados alheios'),
  Conflict: errorResponse('Conflito de estado (`CONFLICT`): transição inválida, viagem encerrada ou edição concorrente'),
  TooMany: errorResponse('Limite de requisições excedido (429, `RATE_LIMITED`): há limite por IP e por usuário; veja o header `Retry-After`'),
  Unavailable: errorResponse('Serviço indisponível ou não configurado (`UNAVAILABLE`)'),
};
const errRef = (name: keyof typeof responses): Json => ({ $ref: `#/components/responses/${name}` });

// ---------- Operações ----------
interface Op {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  tag: string;
  summary: string;
  description?: string;
  auth?: boolean;
  params?: Json[];
  query?: Json[];
  body?: string;
  success: [status: string, description: string, schemaName?: string];
  errors?: (keyof typeof responses)[];
}

const idParam: Json = { name: 'id', in: 'path', required: true, schema: str({ format: 'uuid' }), description: 'Id da viagem' };
const tripErrors = ['BadRequest', 'Unauthorized', 'NotFound', 'TooMany'] as const;

const ops: Op[] = [
  { method: 'post', path: '/v1/auth/register', tag: 'Autenticação', summary: 'Cria a conta', description: 'Nome: 2 a 60 letras (sem dígitos). Senha: 8 a 128 caracteres, guardada com Argon2id. Limite estrito por IP.', body: 'RegisterBody', success: ['201', 'Conta criada', 'AuthResult'], errors: ['BadRequest', 'TooMany'] },
  { method: 'post', path: '/v1/auth/login', tag: 'Autenticação', summary: 'Entra com e-mail e senha', description: 'Mensagem única "Credenciais inválidas" (não revela se o e-mail existe).', body: 'LoginBody', success: ['200', 'Sessão criada', 'AuthResult'], errors: ['BadRequest', 'Unauthorized', 'TooMany'] },
  { method: 'post', path: '/v1/auth/social', tag: 'Autenticação', summary: 'Entra com Google ou Facebook', description: 'Conta existente só loga (200); e-mail igual vincula e loga; senão cria (201). O token é validado no provedor.', body: 'SocialLoginBody', success: ['200', 'Logou numa conta existente', 'AuthResult'], errors: ['BadRequest', 'Unauthorized', 'TooMany', 'Unavailable'] },
  { method: 'post', path: '/v1/auth/refresh', tag: 'Autenticação', summary: 'Troca o refresh token', description: 'Rotaciona a cada uso; reutilizar um token já usado revoga todas as sessões.', body: 'RefreshBody', success: ['200', 'Novos tokens', 'SessionTokens'], errors: ['BadRequest', 'Unauthorized', 'TooMany'] },
  { method: 'post', path: '/v1/auth/logout', tag: 'Autenticação', summary: 'Encerra a sessão', description: 'Idempotente.', body: 'RefreshBody', success: ['204', 'Sessão revogada'], errors: ['BadRequest'] },

  { method: 'get', path: '/v1/users/me', tag: 'Perfil', summary: 'Perfil do usuário logado', auth: true, success: ['200', 'Perfil', 'User'], errors: ['Unauthorized', 'NotFound'] },
  { method: 'patch', path: '/v1/users/me', tag: 'Perfil', summary: 'Atualiza nome, telefone e endereço', description: '`null` limpa telefone/endereço.', auth: true, body: 'UpdateProfileBody', success: ['200', 'Perfil atualizado', 'User'], errors: ['BadRequest', 'Unauthorized', 'NotFound'] },
  { method: 'get', path: '/v1/users/me/stats', tag: 'Perfil', summary: 'Números do perfil', description: 'Conta apenas viagens **concluídas**: viagens realizadas, países e lugares distintos.', auth: true, success: ['200', 'Estatísticas', 'UserTripStats'], errors: ['Unauthorized'] },

  { method: 'post', path: '/v1/trips', tag: 'Viagens', summary: 'Cria uma viagem (rascunho)', description: 'Sempre nasce como `rascunho`; qualquer campo pode faltar, mas o que vier é validado (nada antes de hoje, máx. 10 destinos, orçamento >= 0).', auth: true, body: 'CreateTripBody', success: ['201', 'Viagem criada', 'Trip'], errors: ['BadRequest', 'Unauthorized', 'TooMany'] },
  {
    method: 'get', path: '/v1/trips', tag: 'Viagens', summary: 'Lista as suas viagens', description: 'Paginação por cursor, da mais recente para a mais antiga. Não traz o roteiro.', auth: true,
    query: [
      { name: 'status', in: 'query', schema: str({ enum: [...TRIP_STATUSES] }) },
      { name: 'archived', in: 'query', schema: str({ enum: ['true', 'false'], default: 'false' }), description: 'true lista só as arquivadas' },
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
      { name: 'cursor', in: 'query', schema: str(), description: '`nextCursor` da página anterior' },
    ],
    success: ['200', 'Página de viagens', 'TripList'], errors: ['BadRequest', 'Unauthorized'],
  },
  { method: 'get', path: '/v1/trips/{id}', tag: 'Viagens', summary: 'Detalhe da viagem (com roteiro)', auth: true, params: [idParam], success: ['200', 'Viagem', 'Trip'], errors: [...tripErrors] },
  { method: 'patch', path: '/v1/trips/{id}', tag: 'Viagens', summary: 'Edita campos da viagem', description: 'Só o que for enviado muda; `null` limpa. Depois de `planejada` a viagem não pode ficar incompleta. Concluída/cancelada não editam.', auth: true, params: [idParam], body: 'UpdateTripBody', success: ['200', 'Viagem atualizada', 'Trip'], errors: [...tripErrors, 'Conflict'] },
  { method: 'post', path: '/v1/trips/{id}/status', tag: 'Status e arquivo', summary: 'Muda o status', description: 'Fluxo: rascunho → planejada → em_andamento → concluida; cancelada a partir de qualquer um dos três primeiros. Para `planejada` são obrigatórios origem, 1+ destino, companhia, período e duração. Com datas exatas o status também avança sozinho.', auth: true, params: [idParam], body: 'ChangeStatusBody', success: ['200', 'Viagem com o novo status', 'Trip'], errors: [...tripErrors, 'Conflict'] },
  { method: 'post', path: '/v1/trips/{id}/archive', tag: 'Status e arquivo', summary: 'Arquiva a viagem', description: 'Não existe exclusão: arquivar só esconde da lista padrão. Idempotente.', auth: true, params: [idParam], success: ['200', 'Viagem arquivada', 'Trip'], errors: [...tripErrors] },
  { method: 'delete', path: '/v1/trips/{id}/archive', tag: 'Status e arquivo', summary: 'Desarquiva a viagem', auth: true, params: [idParam], success: ['200', 'Viagem desarquivada', 'Trip'], errors: [...tripErrors] },
  { method: 'post', path: '/v1/trips/{id}/itinerary/generate', tag: 'Roteiro', summary: 'Gera o roteiro inicial', description: 'Determinístico (sem IA): chegada, lugares curtidos, volta. Vários destinos dividem os dias na ordem. Se já existe roteiro, exige `replace: true`. Limite de 366 dias no roteiro.', auth: true, params: [idParam], body: 'GenerateItineraryBody', success: ['200', 'Viagem com roteiro', 'Trip'], errors: [...tripErrors, 'Conflict'] },
  { method: 'put', path: '/v1/trips/{id}/itinerary', tag: 'Roteiro', summary: 'Salva o roteiro editado (inteiro)', description: 'O roteiro é 100% editável: envie o roteiro completo. `revision` precisa ser o `itineraryRevision` atual, senão 409 (evita sobrescrever edição feita em outro aparelho).', auth: true, params: [idParam], body: 'ReplaceItineraryBody', success: ['200', 'Viagem com o roteiro salvo', 'Trip'], errors: [...tripErrors, 'Conflict'] },
  { method: 'post', path: '/v1/trips/{id}/itinerary/ai', tag: 'IA', summary: 'Pede o roteiro final por IA (fila)', description: 'Responde `202` na hora e a geração roda em segundo plano: consulte `GET /v1/ai/generations/{id}` até `succeeded`/`failed`. A IA recebe os dados da viagem + a prévia determinística e o resultado é validado antes de entrar na viagem (só se o roteiro não foi editado nesse meio tempo). Uma geração ativa por viagem; teto diário por usuário (`429`); `503` se a IA não estiver configurada.', auth: true, params: [idParam], body: 'EnqueueGenerationBody', success: ['202', 'Geração enfileirada', 'Generation'], errors: [...tripErrors, 'Conflict', 'Unavailable'] },
  { method: 'get', path: '/v1/trips/{id}/generations', tag: 'IA', summary: 'Últimas gerações da viagem (com tokens e custo)', auth: true, params: [idParam], success: ['200', 'Gerações', 'GenerationList'], errors: [...tripErrors] },
  { method: 'get', path: '/v1/ai/generations/{generationId}', tag: 'IA', summary: 'Status e custo de uma geração', auth: true, params: [{ name: 'generationId', in: 'path', required: true, schema: str({ format: 'uuid' }) }], success: ['200', 'Geração', 'Generation'], errors: ['Unauthorized', 'NotFound'] },
  { method: 'get', path: '/v1/users/me/ai-usage', tag: 'IA', summary: 'Meu consumo de IA', description: 'Total de gerações, tokens e custo estimado (USD) do usuário e quanto resta do teto de hoje.', auth: true, success: ['200', 'Consumo', 'AiUsage'], errors: ['Unauthorized'] },

  { method: 'get', path: '/health', tag: 'Sistema', summary: 'Liveness e checagem do banco', success: ['200', 'OK'], errors: ['Unavailable'] },
];

function buildOperation(op: Op): Json {
  const [status, description, schemaName] = op.success;
  const out: Json = {
    tags: [op.tag],
    summary: op.summary,
    ...(op.description ? { description: op.description } : {}),
    ...(op.auth ? { security: [{ bearerAuth: [] }] } : { security: [] }),
    parameters: [...(op.params ?? []), ...(op.query ?? [])],
    ...(op.body ? { requestBody: { required: true, content: { 'application/json': { schema: ref(op.body) } } } } : {}),
    responses: {
      [status]: schemaName ? { description, content: { 'application/json': { schema: ref(schemaName) } } } : { description },
      ...Object.fromEntries((op.errors ?? []).map((e) => [{ BadRequest: '400', Unauthorized: '401', NotFound: '404', Conflict: '409', TooMany: '429', Unavailable: '503' }[e], errRef(e)])),
    },
  };
  return out;
}

export function buildOpenApiDocument(): Json {
  const paths: Record<string, Record<string, Json>> = {};
  for (const op of ops) (paths[op.path] ??= {})[op.method] = buildOperation(op);
  return {
    openapi: '3.0.3',
    info: {
      title: 'Gloube API',
      version: '0.1.0',
      description:
        'API do app Gloube (assistente Aurora).\n\n' +
        '**Autenticação:** `Authorization: Bearer <accessToken>` (obtido em `/v1/auth/*`). Tudo é por usuário: ' +
        'viagens de outras pessoas respondem `404`, nunca `403`.\n\n' +
        '**Erros:** sempre `{ "error": { "code", "message", "details?" } }`.\n\n' +
        '**Datas:** `AAAA-MM-DD`. **Moeda:** BRL (reais, por pessoa).',
    },
    servers: [{ url: '/', description: 'Servidor atual' }],
    tags: [
      { name: 'Autenticação' }, { name: 'Perfil' }, { name: 'Viagens' }, { name: 'Status e arquivo' }, { name: 'Roteiro' }, { name: 'IA' }, { name: 'Sistema' },
    ],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas,
      responses,
    },
  };
}

/** `/v1/trips/{id}` -> `/v1/trips/:id` (formato das rotas do Fastify), para comparar com a tabela de rotas. */
export const toFastifyPath = (openApiPath: string) => openApiPath.replace(/\{(\w+)\}/g, ':$1');
