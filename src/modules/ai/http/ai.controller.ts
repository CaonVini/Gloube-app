import type { FastifyReply, FastifyRequest } from 'fastify';
import type { EnqueueGenerationUseCase } from '../application/use-cases/enqueue-generation.use-case.js';
import type { GetAiUsageUseCase, GetGenerationUseCase, ListTripGenerationsUseCase } from '../application/use-cases/query-generations.use-cases.js';
import { enqueueBodySchema, generationIdParamsSchema, tripIdParamsSchema } from './ai.schemas.js';

/** O userId vem SEMPRE do token; nada de dono no corpo ou na URL. */
export class AiController {
  constructor(
    private readonly enqueue: EnqueueGenerationUseCase,
    private readonly getGeneration: GetGenerationUseCase,
    private readonly listForTrip: ListTripGenerationsUseCase,
    private readonly getUsage: GetAiUsageUseCase,
  ) {}

  generate = async (req: FastifyRequest, reply: FastifyReply) =>
    reply.status(202).send(await this.enqueue.execute(req.userId, tripIdParamsSchema.parse(req.params).id, enqueueBodySchema.parse(req.body ?? undefined).replace));

  get = async (req: FastifyRequest, reply: FastifyReply) =>
    reply.send(await this.getGeneration.execute(req.userId, generationIdParamsSchema.parse(req.params).generationId));

  listTrip = async (req: FastifyRequest, reply: FastifyReply) =>
    reply.send(await this.listForTrip.execute(req.userId, tripIdParamsSchema.parse(req.params).id));

  usage = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.getUsage.execute(req.userId));
}
