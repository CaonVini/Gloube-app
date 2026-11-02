import { NotFoundError } from '../../../../shared/errors/app-error.js';
import type { UserRepository } from '../../domain/user.repository.js';
import type { AvatarStorage } from '../ports/avatar-storage.js';
import type { UserDTO } from '../dtos.js';
import type { UserPresenter } from '../user-presenter.js';

export class RemoveAvatarUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly storage: AvatarStorage,
    private readonly presenter: UserPresenter,
  ) {}

  /** Idempotente: sem foto, devolve o perfil como está. */
  async execute(userId: string): Promise<UserDTO> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Usuário não encontrado');
    if (!user.avatarKey) return this.presenter.present(user);

    const oldKey = user.avatarKey;
    const updated = user.withAvatarKey(null);
    await this.users.update(updated);
    await this.storage.delete(oldKey).catch(() => undefined);
    return this.presenter.present(updated);
  }
}
