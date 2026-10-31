import { createRemoteJWKSet, jwtVerify } from 'jose';
import { UnauthorizedError } from '../../../shared/errors/app-error.js';
import type { SocialProfile, SocialTokenVerifier } from '../application/ports/social-token-verifier.js';

/**
 * Valida o **ID token** do Google (JWT RS256) localmente, com as chaves públicas do Google.
 * O app mobile obtém o ID token pelo Google Sign-In e o envia para a API.
 * `jose` cacheia o JWKS, então não há uma chamada ao Google por login.
 */
export class GoogleTokenVerifier implements SocialTokenVerifier {
  readonly provider = 'google' as const;
  private readonly jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
    timeoutDuration: 5_000,
  });

  /** Client IDs aceitos (Android, iOS e Web têm IDs diferentes). */
  constructor(private readonly clientIds: string[]) {}

  async verify(token: string): Promise<SocialProfile> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        algorithms: ['RS256'],
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: this.clientIds, // impede aceitar tokens emitidos para OUTRO app
      });
      if (!payload.sub) throw new Error('sem sub');
      const email = typeof payload.email === 'string' ? payload.email : null;
      return {
        provider: 'google',
        providerUserId: payload.sub,
        name: typeof payload.name === 'string' ? payload.name : '',
        email,
        emailVerified: payload.email_verified === true && email !== null,
      };
    } catch {
      throw new UnauthorizedError('Token do Google inválido');
    }
  }
}
