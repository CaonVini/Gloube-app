import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GetUserProfileUseCase } from '../application/use-cases/get-user-profile.use-case.js';

export class UserController {
  constructor(private readonly getUserProfile: GetUserProfileUseCase) {}

  me = async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.getUserProfile.execute(request.userId));
  };
}
