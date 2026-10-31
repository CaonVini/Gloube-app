import type { RefreshTokenRepository } from '../../domain/refresh-token.repository.js';
import type { OpaqueTokenService } from '../ports/opaque-token-service.js';

/** Idempotente: token inexistente ou já revogado não gera erro (não vaza informação). */
export class LogoutUseCase {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly opaqueTokens: OpaqueTokenService,
  ) {}

  async execute(refreshToken: string): Promise<void> {
    const stored = await this.refreshTokens.findByHash(this.opaqueTokens.hash(refreshToken));
    if (stored && !stored.isRevoked()) await this.refreshTokens.revoke(stored.id);
  }
}
