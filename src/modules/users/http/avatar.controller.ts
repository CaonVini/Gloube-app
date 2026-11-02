import type { FastifyReply, FastifyRequest } from 'fastify';
import { ServiceUnavailableError, ValidationError } from '../../../shared/errors/app-error.js';
import type { SetAvatarUseCase } from '../application/use-cases/set-avatar.use-case.js';
import type { RemoveAvatarUseCase } from '../application/use-cases/remove-avatar.use-case.js';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** Os casos de uso são nulos quando o S3 não está configurado (responde 503). */
export class AvatarController {
  constructor(
    private readonly setAvatar: SetAvatarUseCase | null,
    private readonly removeAvatar: RemoveAvatarUseCase | null,
  ) {}

  put = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!this.setAvatar) throw new ServiceUnavailableError('Armazenamento de fotos não configurado');
    if (!request.isMultipart()) throw new ValidationError('Envie a foto como multipart/form-data no campo "file"');

    // O limite de 5 MB é imposto durante o streaming (para de ler no limite, sem bufferizar o excedente)
    const part = await request.file({ limits: { fileSize: MAX_AVATAR_BYTES, files: 1, fields: 0 } });
    if (!part || part.fieldname !== 'file') throw new ValidationError('Envie a foto no campo "file"');

    const buffer = await part.toBuffer(); // lança 413 (RequestFileTooLargeError) se passar do limite
    if (part.file.truncated) throw new ValidationError(`A foto é grande demais (máx. ${MAX_AVATAR_BYTES / 1024 / 1024} MB)`);
    if (buffer.length === 0) throw new ValidationError('Arquivo vazio');

    return reply.send(await this.setAvatar.execute(request.userId, buffer));
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!this.removeAvatar) throw new ServiceUnavailableError('Armazenamento de fotos não configurado');
    return reply.send(await this.removeAvatar.execute(request.userId));
  };
}
