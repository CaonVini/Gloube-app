import type { RefreshToken } from './refresh-token.entity.js';

export interface RefreshTokenRepository {
  create(token: RefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  /**
   * Revoga de forma atômica. Retorna `true` apenas se ESTA chamada revogou
   * (o token ainda estava ativo). Evita que duas requisições concorrentes
   * usem o mesmo refresh token.
   */
  revoke(id: string): Promise<boolean>;
  revokeAllForUser(userId: string): Promise<void>;
}
