import { randomUUID } from 'node:crypto';

export interface RefreshTokenProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export class RefreshToken {
  private constructor(private readonly props: RefreshTokenProps) {}

  static create(input: { userId: string; tokenHash: string; ttlDays: number }): RefreshToken {
    const now = new Date();
    return new RefreshToken({
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: new Date(now.getTime() + input.ttlDays * 86_400_000),
      revokedAt: null,
      createdAt: now,
    });
  }

  static restore(props: RefreshTokenProps): RefreshToken {
    return new RefreshToken({ ...props });
  }

  isExpired(now = new Date()): boolean {
    return this.props.expiresAt.getTime() <= now.getTime();
  }

  isRevoked(): boolean {
    return this.props.revokedAt !== null;
  }

  get id() { return this.props.id; }
  get userId() { return this.props.userId; }
  get tokenHash() { return this.props.tokenHash; }
  get expiresAt() { return this.props.expiresAt; }
  get revokedAt() { return this.props.revokedAt; }
  get createdAt() { return this.props.createdAt; }
}
