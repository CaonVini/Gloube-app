import { createHash, randomBytes } from 'node:crypto';
import type { OpaqueTokenService } from '../application/ports/opaque-token-service.js';

export class CryptoOpaqueTokenService implements OpaqueTokenService {
  generate(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url'); // 256 bits de entropia
    return { token, hash: this.hash(token) };
  }

  /** SHA-256 basta aqui: o token já tem alta entropia, não precisa de hash lento. */
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
