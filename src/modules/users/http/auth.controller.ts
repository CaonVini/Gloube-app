import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RegisterUserUseCase } from '../application/use-cases/register-user.use-case.js';
import type { AuthenticateUserUseCase } from '../application/use-cases/authenticate-user.use-case.js';
import type { RefreshSessionUseCase } from '../application/use-cases/refresh-session.use-case.js';
import type { LogoutUseCase } from '../application/use-cases/logout.use-case.js';
import { loginBodySchema, refreshBodySchema, registerBodySchema } from './user.schemas.js';

/**
 * Controller "magro": valida entrada, chama o caso de uso e formata a resposta.
 * Nenhuma regra de negócio aqui (SRP).
 */
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly authenticateUser: AuthenticateUserUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
  ) {}

  register = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = registerBodySchema.parse(request.body);
    const result = await this.registerUser.execute(body);
    return reply.status(201).send(result);
  };

  login = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginBodySchema.parse(request.body);
    return reply.send(await this.authenticateUser.execute(body));
  };

  refresh = async (request: FastifyRequest, reply: FastifyReply) => {
    const { refreshToken } = refreshBodySchema.parse(request.body);
    return reply.send(await this.refreshSession.execute(refreshToken));
  };

  logout = async (request: FastifyRequest, reply: FastifyReply) => {
    const { refreshToken } = refreshBodySchema.parse(request.body);
    await this.logoutUseCase.execute(refreshToken);
    return reply.status(204).send();
  };
}
