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
});
