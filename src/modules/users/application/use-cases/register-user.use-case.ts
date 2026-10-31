import { ConflictError } from '../../../../shared/errors/app-error.js';
import { User } from '../../domain/user.entity.js';
import type { UserRepository } from '../../domain/user.repository.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import { toUserDTO, type AuthResultDTO } from '../dtos.js';
import type { IssueSessionService } from './issue-session.service.js';

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
}

export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly issueSession: IssueSessionService,
  ) {}

  async execute(input: RegisterUserInput): Promise<AuthResultDTO> {
    const email = User.normalizeEmail(input.email);

    // Checagem rápida para mensagem amigável; a garantia real é o índice único
    // (o repositório converte a violação 23505 em ConflictError em caso de corrida).
    if (await this.users.findByEmail(email)) {
      throw new ConflictError('E-mail já cadastrado');
    }

    const passwordHash = await this.hasher.hash(input.password);
    const user = User.create({ name: input.name, email, passwordHash });
    await this.users.create(user);

    const tokens = await this.issueSession.execute(user.id);
    return { user: toUserDTO(user), tokens };
  }
}
