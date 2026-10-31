import type { SocialProvider } from '../../domain/social-identity.js';

export interface SocialProfile {
  provider: SocialProvider;
  providerUserId: string;
  name: string;
  /** Nulo se o provedor não informou e-mail (ex.: Facebook sem permissão). */
  email: string | null;
  /** True apenas quando o provedor GARANTE que o e-mail pertence ao usuário. */
  emailVerified: boolean;
}

export interface SocialTokenVerifier {
  readonly provider: SocialProvider;
  /** Valida o token junto ao provedor. Lança UnauthorizedError se inválido. */
  verify(token: string): Promise<SocialProfile>;
}
