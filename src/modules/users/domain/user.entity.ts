import { randomUUID } from 'node:crypto';

export interface UserProps {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Entidade de domínio. Não conhece Drizzle, HTTP nem bibliotecas de hash.
 * Regras de invariantes (ex.: normalização de e-mail) vivem aqui.
 */
export class User {
  private constructor(private readonly props: UserProps) {}

  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  static create(input: { name: string; email: string; passwordHash: string }): User {
    const now = new Date();
    return new User({
      id: randomUUID(),
      name: input.name.trim(),
      email: User.normalizeEmail(input.email),
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Reconstrói a entidade a partir da persistência (sem regras de criação). */
  static restore(props: UserProps): User {
    return new User({ ...props });
  }

  get id() { return this.props.id; }
  get name() { return this.props.name; }
  get email() { return this.props.email; }
  get passwordHash() { return this.props.passwordHash; }
  get createdAt() { return this.props.createdAt; }
  get updatedAt() { return this.props.updatedAt; }
}
