export interface OpaqueTokenService {
  /** Gera um token aleatório criptograficamente seguro e seu hash para persistência. */
  generate(): { token: string; hash: string };
  hash(token: string): string;
}
