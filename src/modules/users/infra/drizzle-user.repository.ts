import { eq } from 'drizzle-orm';
import type { Database } from '../../../infra/database/client.js';
import { users, type UserRow } from '../../../infra/database/schema/index.js';
import { isUniqueViolation } from '../../../infra/database/pg-errors.js';
import { ConflictError } from '../../../shared/errors/app-error.js';
import { User } from '../domain/user.entity.js';
import type { UserRepository } from '../domain/user.repository.js';

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async create(user: User): Promise<void> {
    try {
      await this.db.insert(users).values({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        avatarKey: user.avatarKey,
        passwordHash: user.passwordHash,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('E-mail já cadastrado');
      throw err;
    }
  }

  async update(user: User): Promise<void> {
    await this.db
      .update(users)
      .set({
        name: user.name,
        phone: user.phone,
        address: user.address,
        avatarKey: user.avatarKey,
        passwordHash: user.passwordHash,
        updatedAt: user.updatedAt,
      })
      .where(eq(users.id, user.id));
  }

  private toDomain(row: UserRow): User {
    return User.restore(row);
  }
}
