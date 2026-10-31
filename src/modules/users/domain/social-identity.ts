import { randomUUID } from 'node:crypto';

export const SOCIAL_PROVIDERS = ['google', 'facebook'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export interface SocialIdentity {
  id: string;
  userId: string;
  provider: SocialProvider;
  providerUserId: string;
}

export const newSocialIdentity = (
  userId: string,
  provider: SocialProvider,
  providerUserId: string,
): SocialIdentity => ({ id: randomUUID(), userId, provider, providerUserId });
