import { RefreshToken } from '../../domain/refresh-token.entity.js';
import type { RefreshTokenRepository } from '../../domain/refresh-token.repository.js';
import type { AccessTokenService } from '../ports/access-token-service.js';
import type { OpaqueTokenService } from '../ports/opaque-token-service.js';
import type { SessionTokensDTO } from '../dtos.js';

/** Emite o par access token (JWT curto) + refresh token (opaco, longo, persistido como hash). */
export class IssueSessionService {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly opaqueTokens: OpaqueTokenService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly refreshTtlDays: number,
  ) {}

  async execute(userId: string): Promise<SessionTokensDTO> {
    const { token, hash } = this.opaqueTokens.generate();
    const [accessToken] = await Promise.all([
      this.accessTokens.sign({ sub: userId }),
      this.refreshTokens.create(
        RefreshToken.create({ userId, tokenHash: hash, ttlDays: this.refreshTtlDays }),
      ),
    ]);
    return {
      accessToken,
      refreshToken: token,
      tokenType: 'Bearer',
      expiresIn: this.accessTokens.expiresInSeconds,
    };
  }
}
