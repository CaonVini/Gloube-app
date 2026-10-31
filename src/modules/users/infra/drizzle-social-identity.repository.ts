import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../infra/database/client.js';
import { socialIdentities } from '../../../infra/database/schema/index.js';
import { isUniqueViolation } from '../../../infra/database/pg-errors.js';
import { ConflictError } from '../../../shared/errors/app-error.js';
import type { SocialIdentity, SocialProvider } from '../domain/social-identity.js';
import type { SocialIdentityRepository } from '../domain/social-identity.repository.js';

export class DrizzleSocialIdentityRepository implements SocialIdentityRepository {
  constructor(private readonly db: Database) {}

  async findByProvider(provider: SocialProvider, providerUserId: string): Promise<SocialIdentity | null> {
    const [row] = await this.db
      .select()
      .from(socialIdentities)
      .where(and(eq(socialIdentities.provider, provider), eq(socialIdentities.providerUserId, providerUserId)))
      .limit(1);
    return row ? { ...row, provider: row.provider as SocialProvider } : null;
  }

  async create(identity: SocialIdentity): Promise<void> {
    try {
      await this.db.insert(socialIdentities).values(identity);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('Identidade social já vinculada');
      throw err;
    }
  }
}
