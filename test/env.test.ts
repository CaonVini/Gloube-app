import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('falha sem DATABASE_URL/JWT e não vaza valores', () => {
    expect(() => loadEnv({ JWT_ACCESS_SECRET: 'curto' } as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });
  it('aceita configuração válida', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://a:b@localhost:5432/db',
      JWT_ACCESS_SECRET: 'x'.repeat(32),
    } as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(3333);
    expect(env.CORS_ORIGINS).toEqual([]);
  });
  it('recusa segredo de exemplo em produção, mas aceita em desenvolvimento', () => {
    const base = { DATABASE_URL: 'postgres://a:b@localhost:5432/db', JWT_ACCESS_SECRET: 'dev-only-insecure-secret-change-me-0123456789' };
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/produção/);
    expect(() => loadEnv({ ...base, NODE_ENV: 'development' } as NodeJS.ProcessEnv)).not.toThrow();
  });
});
