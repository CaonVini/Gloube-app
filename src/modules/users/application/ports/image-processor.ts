export interface ProcessedImage {
  data: Buffer;
  contentType: string;
}

/** Lançado quando o arquivo não é uma imagem JPG/PNG/WebP válida. */
export class InvalidImageError extends Error {
  constructor(message = 'Imagem inválida') {
    super(message);
    this.name = 'InvalidImageError';
  }
}

export interface ImageProcessor {
  /** Valida pelo conteúdo real, aplica orientação, remove metadados (EXIF/GPS) e normaliza o tamanho. */
  processAvatar(input: Buffer): Promise<ProcessedImage>;
}
