export interface AccessTokenPayload {
  sub: string;
}

export interface AccessTokenService {
  readonly expiresInSeconds: number;
  sign(payload: AccessTokenPayload): Promise<string>;
  /** Lança UnauthorizedError se inválido/expirado. */
  verify(token: string): Promise<AccessTokenPayload>;
}
