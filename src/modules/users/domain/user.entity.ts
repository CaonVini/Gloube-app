import { randomUUID } from 'node:crypto';
import type { Address } from './address.js';

export interface UserProps {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: Address | null;
  /** Chave do objeto no storage (S3); nulo = sem foto. */
  avatarKey: string | null;
  /** Nulo para contas criadas apenas por login social. */
  passwordHash: string | null;
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

  /** Remove espaços, parênteses e hífens; mantém "+" inicial. */
  static normalizePhone(phone: string): string {
    return phone.replace(/[\s().-]/g, '');
  }

  static create(input: {
    name: string;
    email: string;
    passwordHash: string | null;
    phone?: string | null;
    address?: Address | null;
  }): User {
    const now = new Date();
    return new User({
      id: randomUUID(),
      name: input.name.trim(),
      email: User.normalizeEmail(input.email),
      phone: input.phone ? User.normalizePhone(input.phone) : null,
      address: input.address ?? null,
      avatarKey: null,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Reconstrói a entidade a partir da persistência (sem regras de criação). */
  static restore(props: UserProps): User {
    return new User({ ...props });
  }

  /** Retorna uma nova instância com o perfil atualizado (entidade imutável). */
  withProfile(changes: { name?: string; phone?: string | null; address?: Address | null }): User {
    return new User({
      ...this.props,
      name: changes.name !== undefined ? changes.name.trim() : this.props.name,
      phone:
        changes.phone === undefined
          ? this.props.phone
          : changes.phone === null
            ? null
            : User.normalizePhone(changes.phone),
      address: changes.address === undefined ? this.props.address : changes.address,
      updatedAt: new Date(),
    });
  }

  withAvatarKey(avatarKey: string | null): User {
    return new User({ ...this.props, avatarKey, updatedAt: new Date() });
  }

  /** Remove a senha (usado ao vincular conta social a uma conta de e-mail não verificado). */
  withoutPassword(): User {
    return new User({ ...this.props, passwordHash: null, updatedAt: new Date() });
  }

  get id() { return this.props.id; }
  get name() { return this.props.name; }
  get email() { return this.props.email; }
  get phone() { return this.props.phone; }
  get address() { return this.props.address; }
  get avatarKey() { return this.props.avatarKey; }
  get passwordHash() { return this.props.passwordHash; }
  get createdAt() { return this.props.createdAt; }
  get updatedAt() { return this.props.updatedAt; }
}
