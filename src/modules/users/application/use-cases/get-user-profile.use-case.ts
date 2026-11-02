import { NotFoundError } from '../../../../shared/errors/app-error.js';
import type { UserRepository } from '../../domain/user.repository.js';
import type { UserDTO } from '../dtos.js';
import type { UserPresenter } from '../user-presenter.js';

export class GetUserProfileUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly presenter: UserPresenter,
  ) {}

  async execute(userId: string): Promise<UserDTO> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Usuário não encontrado');
    return this.presenter.present(user);
  }
}
