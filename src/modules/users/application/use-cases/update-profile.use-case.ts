import { NotFoundError } from '../../../../shared/errors/app-error.js';
import type { Address } from '../../domain/address.js';
import type { UserRepository } from '../../domain/user.repository.js';
import type { UserDTO } from '../dtos.js';
import type { UserPresenter } from '../user-presenter.js';

export interface UpdateProfileInput {
  name?: string;
  /** null remove o telefone */
  phone?: string | null;
  /** null remove o endereço */
  address?: Address | null;
}

export class UpdateProfileUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly presenter: UserPresenter,
  ) {}

  async execute(userId: string, input: UpdateProfileInput): Promise<UserDTO> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Usuário não encontrado');

    const updated = user.withProfile(input);
    await this.users.update(updated);
    return this.presenter.present(updated);
  }
}
