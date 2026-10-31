import { NotFoundError } from '../../../../shared/errors/app-error.js';
import type { UserRepository } from '../../domain/user.repository.js';
import { toUserDTO, type UserDTO } from '../dtos.js';

export class GetUserProfileUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<UserDTO> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Usuário não encontrado');
    return toUserDTO(user);
  }
}
