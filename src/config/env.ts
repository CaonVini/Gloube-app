import 'dotenv/config';
import { z } from 'zod';

/**
 * Valida as variáveis de ambiente na inicialização (fail-fast).
 * Se algo estiver faltando ou inválido o processo encerra antes de abrir a porta.
 */
const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: booleanFromString,

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET precisa de pelo menos 32 caracteres'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  JWT_ISSUER: z.string().min(1).default('aurora-api'),
  JWT_AUDIENCE: z.string().min(1).default('aurora-mobile'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  // Login social (opcional): provedor sem configuração responde 503
  GOOGLE_CLIENT_IDS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),

  // Documentação Swagger em /docs. Padrão: ligada fora de produção, desligada em produção.
  DOCS_ENABLED: z.enum(['true', 'false', '1', '0']).optional().transform((v) => (v === undefined ? undefined : v === 'true' || v === '1')),

  // IA (geração de roteiro). Sem OPENAI_API_KEY + OPENAI_MODEL a geração por IA responde 503.
  // Segredo SOMENTE por variável de ambiente. Não há modelo padrão: a escolha (e o preço) é explícita.
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).max(80).optional(),
  OPENAI_BASE_URL: z.url().default('https://api.openai.com/v1'),
  // Preço em USD por 1 milhão de tokens (veja a página de preços do modelo). Sem preço, o custo fica nulo.
  AI_PRICE_INPUT_PER_1M_USD: z.coerce.number().min(0).optional(),
  AI_PRICE_OUTPUT_PER_1M_USD: z.coerce.number().min(0).optional(),
  AI_PROMPT_VERSION: z.string().min(1).default('v1'),
  AI_DAILY_LIMIT_PER_USER: z.coerce.number().int().min(1).default(5),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(500).max(64_000).default(12_000),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(120_000),
  AI_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
  // Limite por minuto/IP do endpoint que gasta dinheiro (além do teto diário por usuário)
  AI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(5),
  AI_WORKER_POLL_MS: z.coerce.number().int().min(250).default(2_000),
  AI_WORKER_ENABLED: z.enum(['true', 'false', '1', '0']).default('true').transform((v) => v === 'true' || v === '1'),

  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  // Limite por minuto/IP das rotas de credenciais (login, cadastro, social)
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  // Limite por minuto POR USUÁRIO autenticado (além do limite por IP)
  USER_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
});

export type Env = z.infer<typeof envSchema>;

/** Segredos de exemplo/desenvolvimento nunca podem ir para produção. */
const PLACEHOLDER_SECRET = /^(dev-only|troque-por)/;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Nunca imprime valores, apenas quais chaves falharam (evita vazar segredos em log)
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && PLACEHOLDER_SECRET.test(parsed.data.JWT_ACCESS_SECRET)) {
    throw new Error('Variáveis de ambiente inválidas:\n  - JWT_ACCESS_SECRET: segredo de exemplo não pode ser usado em produção');
  }
  return parsed.data;
}
