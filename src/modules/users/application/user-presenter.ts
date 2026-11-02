import type { User } from '../domain/user.entity.js';
import type { AvatarStorage } from './ports/avatar-storage.js';
import { toUserDTO, type UserDTO } from './dtos.js';

/** Monta o UserDTO da resposta, incluindo a URL assinada da foto (quando existe e o storage está configurado). */
export class UserPresenter {
  constructor(private readonly avatarStorage: AvatarStorage | null) {}

  async present(user: User): Promise<UserDTO> {
    const avatarUrl = user.avatarKey && this.avatarStorage ? await this.avatarStorage.signedUrl(user.avatarKey) : null;
    return toUserDTO(user, avatarUrl);
  }
}
