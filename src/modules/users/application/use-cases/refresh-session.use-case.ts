import { UnauthorizedError } from '../../../../shared/errors/app-error.js';
import type { RefreshTokenRepository } from '../../domain/refresh-token.repository.js';
import type { OpaqueTokenService } from '../ports/opaque-token-service.js';
import type { SessionTokensDTO } from '../dtos.js';
import type { IssueSessionService } from './issue-session.service.js';

/**
 * Rotação de refresh token: cada refresh token só pode ser usado UMA vez.
 * Se um token já revogado for reapresentado, assumimos roubo (reuse detection)
 * e revogamos todas as sessões do usuário.
 */
export class RefreshSessionUseCase {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly opaqueTokens: OpaqueTokenService,
    private readonly issueSession: IssueSessionService,
  ) {}

  async execute(refreshToken: string): Promise<SessionTokensDTO> {
    const stored = await this.refreshTokens.findByHash(this.opaqueTokens.hash(refreshToken));
    if (!stored) throw new UnauthorizedError('Refresh token inválido');

    if (stored.isRevoked()) {
      await this.refreshTokens.revokeAllForUser(stored.userId);
      throw new UnauthorizedError('Refresh token inválido');
    }

    if (stored.isExpired()) throw new UnauthorizedError('Refresh token expirado');

    // Revogação atômica: se outra requisição revogou entre o find e aqui, é reuso.
    const revokedNow = await this.refreshTokens.revoke(stored.id);
    if (!revokedNow) {
      await this.refreshTokens.revokeAllForUser(stored.userId);
      throw new UnauthorizedError('Refresh token inválido');
    }

    return this.issueSession.execute(stored.userId);
  }
}
