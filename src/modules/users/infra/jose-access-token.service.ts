import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { UnauthorizedError } from '../../../shared/errors/app-error.js';
import type { AccessTokenPayload, AccessTokenService } from '../application/ports/access-token-service.js';

export interface JoseAccessTokenConfig {
  secret: string;
  expiresInSeconds: number;
  issuer: string;
  audience: string;
}

export class JoseAccessTokenService implements AccessTokenService {
  private readonly key: Uint8Array;
  readonly expiresInSeconds: number;

  constructor(private readonly config: JoseAccessTokenConfig) {
    this.key = new TextEncoder().encode(config.secret);
    this.expiresInSeconds = config.expiresInSeconds;
  }

  sign(payload: AccessTokenPayload): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(payload.sub)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setIssuedAt()
      .setExpirationTime(`${this.expiresInSeconds}s`)
      .sign(this.key);
  }

  async verify(token: string): Promise<AccessTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'], // fixa o algoritmo: bloqueia "alg: none" e confusão de algoritmo
        issuer: this.config.issuer,
        audience: this.config.audience,
      });
      if (!payload.sub) throw new UnauthorizedError('Token inválido');
      return { sub: payload.sub };
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) throw new UnauthorizedError('Token expirado');
      throw new UnauthorizedError('Token inválido');
    }
  }
}
