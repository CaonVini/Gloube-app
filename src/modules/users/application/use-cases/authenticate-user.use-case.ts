import { UnauthorizedError } from '../../../../shared/errors/app-error.js';
import { User } from '../../domain/user.entity.js';
import type { UserRepository } from '../../domain/user.repository.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import { toUserDTO, type AuthResultDTO } from '../dtos.js';
import type { IssueSessionService } from './issue-session.service.js';

export interface AuthenticateUserInput {
  email: string;
  password: string;
}

export class AuthenticateUserUseCase {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly issueSession: IssueSessionService,
  ) {}

  async execute(input: AuthenticateUserInput): Promise<AuthResultDTO> {
    const user = await this.users.findByEmail(User.normalizeEmail(input.email));

    // Conta só-social (sem senha) é tratada como inexistente para login por senha,
    // com a mesma mensagem e o mesmo custo de tempo.
    if (!user || !user.passwordHash) {
      // Executa um verify "falso" para que o tempo de resposta seja parecido com o
      // de um usuário existente — dificulta enumeração de e-mails por timing.
      await this.hasher.verify(await this.getDummyHash(), input.password);
      throw new UnauthorizedError('Credenciais inválidas');
    }

    const valid = await this.hasher.verify(user.passwordHash, input.password);
    if (!valid) throw new UnauthorizedError('Credenciais inválidas');

    const tokens = await this.issueSession.execute(user.id);
    return { user: toUserDTO(user), tokens };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash('dummy-password-for-timing-equalization');
    return this.dummyHash;
  }
}
