import type { SocialIdentity, SocialProvider } from './social-identity.js';

export interface SocialIdentityRepository {
  findByProvider(provider: SocialProvider, providerUserId: string): Promise<SocialIdentity | null>;
  /** Lança ConflictError se a identidade já estiver vinculada (corrida). */
  create(identity: SocialIdentity): Promise<void>;
}
