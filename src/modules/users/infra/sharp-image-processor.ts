import sharp from 'sharp';
import { InvalidImageError, type ImageProcessor, type ProcessedImage } from '../application/ports/image-processor.js';

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const AVATAR_SIZE = 512;
// Barra "image bombs" (arquivo pequeno que descomprime para gigabytes de pixels)
const MAX_INPUT_PIXELS = 50_000_000;

export class SharpImageProcessor implements ImageProcessor {
  async processAvatar(input: Buffer): Promise<ProcessedImage> {
    try {
      const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
      // O formato vem dos bytes (magic numbers), nunca do Content-Type nem da extensão enviados pelo cliente
      const { format } = await image.metadata();
      if (!format || !ALLOWED_FORMATS.has(format)) throw new InvalidImageError('Formato não suportado. Use JPG, PNG ou WebP.');

      const data = await image
        .rotate() // aplica a orientação EXIF antes de descartá-la
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'attention' })
        .webp({ quality: 82 }) // sharp não copia EXIF/GPS/ICC a menos que se peça (withMetadata)
        .toBuffer();
      return { data, contentType: 'image/webp' };
    } catch (err) {
      if (err instanceof InvalidImageError) throw err;
      throw new InvalidImageError('Não foi possível ler a imagem. Tente outra foto.');
    }
  }
}
