import { hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '../application/ports/password-hasher.js';

/**
 * Argon2id (padrão da lib) com parâmetros mínimos recomendados pela OWASP:
 * m=19 MiB, t=2, p=1. Implementação nativa em Rust, roda fora do event loop.
 */
export class Argon2PasswordHasher implements PasswordHasher {
  private readonly options = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

  hash(plain: string): Promise<string> {
    return hash(plain, this.options);
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain);
    } catch {
      return false; // hash malformado nunca deve virar 500 nem autenticar
    }
  }
}
