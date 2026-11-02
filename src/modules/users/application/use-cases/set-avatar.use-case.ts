import { randomUUID } from 'node:crypto';
import { NotFoundError, ValidationError } from '../../../../shared/errors/app-error.js';
import type { UserRepository } from '../../domain/user.repository.js';
import type { AvatarStorage } from '../ports/avatar-storage.js';
import { InvalidImageError, type ImageProcessor } from '../ports/image-processor.js';
import type { UserDTO } from '../dtos.js';
import type { UserPresenter } from '../user-presenter.js';

export class SetAvatarUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly storage: AvatarStorage,
    private readonly images: ImageProcessor,
    private readonly presenter: UserPresenter,
  ) {}

  async execute(userId: string, file: Buffer): Promise<UserDTO> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Usuário não encontrado');

    let processed;
    try {
      processed = await this.images.processAvatar(file);
    } catch (err) {
      if (err instanceof InvalidImageError) throw new ValidationError(err.message);
      throw err;
    }

    // Chave aleatória e prefixada pelo dono: o cliente não influencia o caminho e a URL antiga deixa de valer
    const key = `avatars/${userId}/${randomUUID()}.webp`;
    await this.storage.put(key, processed.data, processed.contentType);

    const previousKey = user.avatarKey;
    const updated = user.withAvatarKey(key);
    try {
      await this.users.update(updated);
    } catch (err) {
      await this.storage.delete(key).catch(() => undefined); // evita objeto órfão
      throw err;
    }
    if (previousKey) await this.storage.delete(previousKey).catch(() => undefined);
    return this.presenter.present(updated);
  }
}
