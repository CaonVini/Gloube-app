/** Porta de armazenamento de fotos (S3 hoje; trocável sem mexer nos casos de uso). */
export interface AvatarStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Idempotente: apagar chave inexistente não é erro. */
  delete(key: string): Promise<void>;
  /** URL temporária de leitura (o bucket é privado). */
  signedUrl(key: string): Promise<string>;
}
