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

/** Variável vazia (ex.: `S3_ENDPOINT=` no .env/compose) conta como ausente. */
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

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

  // Avatar (S3 ou compatível, ex.: MinIO). Sem S3_BUCKET os endpoints de avatar respondem 503.
  S3_BUCKET: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  S3_REGION: z.string().min(1).default('us-east-1'),
  // Só para S3 compatível (MinIO/R2); em AWS deixe vazio
  S3_ENDPOINT: z.preprocess(emptyToUndefined, z.url().optional()),
  // Opcionais: se vazios, usa a cadeia padrão de credenciais da AWS (IAM role, etc.)
  S3_ACCESS_KEY_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  S3_SECRET_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  S3_FORCE_PATH_STYLE: booleanFromString,
  AVATAR_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),

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
  // Limite por minuto/IP de upload/remoção de foto (processar imagem é caro)
  UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
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
