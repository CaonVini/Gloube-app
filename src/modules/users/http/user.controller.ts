import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UpdateProfileUseCase } from '../application/use-cases/update-profile.use-case.js';
import { updateProfileBodySchema } from './user.schemas.js';
import type { GetUserProfileUseCase } from '../application/use-cases/get-user-profile.use-case.js';

export class UserController {
  constructor(
    private readonly getUserProfile: GetUserProfileUseCase,
    private readonly updateProfile: UpdateProfileUseCase,
  ) {}

  me = async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.getUserProfile.execute(request.userId));
  };

  updateMe = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = updateProfileBodySchema.parse(request.body);
    return reply.send(await this.updateProfile.execute(request.userId, body));
  };
}
