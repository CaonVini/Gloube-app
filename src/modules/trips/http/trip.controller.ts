import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CreateTripUseCase } from '../application/use-cases/create-trip.use-case.js';
import type { GetTripUseCase } from '../application/use-cases/get-trip.use-case.js';
import type { ListTripsUseCase } from '../application/use-cases/list-trips.use-case.js';
import type { UpdateTripUseCase } from '../application/use-cases/update-trip.use-case.js';
import type { ChangeTripStatusUseCase } from '../application/use-cases/change-trip-status.use-case.js';
import type { SetTripArchivedUseCase } from '../application/use-cases/set-trip-archived.use-case.js';
import type { GenerateItineraryUseCase, ReplaceItineraryUseCase } from '../application/use-cases/itinerary.use-cases.js';
import {
  changeStatusBodySchema, createTripBodySchema, generateItineraryBodySchema, listTripsQuerySchema,
  replaceItineraryBodySchema, tripIdParamsSchema, updateTripBodySchema,
} from './trip.schemas.js';

/** Controller magro: valida a borda (zod), pega o userId do token e delega. Nunca lê userId/status do corpo. */
export class TripController {
  constructor(
    private readonly createTrip: CreateTripUseCase,
    private readonly getTrip: GetTripUseCase,
    private readonly listTrips: ListTripsUseCase,
    private readonly updateTrip: UpdateTripUseCase,
    private readonly changeStatus: ChangeTripStatusUseCase,
    private readonly setArchived: SetTripArchivedUseCase,
    private readonly generateItinerary: GenerateItineraryUseCase,
    private readonly replaceItinerary: ReplaceItineraryUseCase,
  ) {}

  create = async (req: FastifyRequest, reply: FastifyReply) =>
    reply.status(201).send(await this.createTrip.execute(req.userId, createTripBodySchema.parse(req.body ?? {})));

  list = async (req: FastifyRequest, reply: FastifyReply) =>
    reply.send(await this.listTrips.execute(req.userId, listTripsQuerySchema.parse(req.query)));

  get = async (req: FastifyRequest, reply: FastifyReply) =>
    reply.send(await this.getTrip.execute(req.userId, tripIdParamsSchema.parse(req.params).id));

  update = async (req: FastifyRequest, reply: FastifyReply) =>
    reply.send(await this.updateTrip.execute(req.userId, tripIdParamsSchema.parse(req.params).id, updateTripBodySchema.parse(req.body ?? {})));

  status = async (req: FastifyRequest, reply: FastifyReply) =>
    reply.send(await this.changeStatus.execute(req.userId, tripIdParamsSchema.parse(req.params).id, changeStatusBodySchema.parse(req.body).status));

  archive = async (req: FastifyRequest, reply: FastifyReply) =>
    reply.send(await this.setArchived.execute(req.userId, tripIdParamsSchema.parse(req.params).id, true));

  unarchive = async (req: FastifyRequest, reply: FastifyReply) =>
    reply.send(await this.setArchived.execute(req.userId, tripIdParamsSchema.parse(req.params).id, false));

  generate = async (req: FastifyRequest, reply: FastifyReply) =>
    reply.send(await this.generateItinerary.execute(req.userId, tripIdParamsSchema.parse(req.params).id, generateItineraryBodySchema.parse(req.body ?? undefined).replace));

  putItinerary = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = replaceItineraryBodySchema.parse(req.body);
    return reply.send(await this.replaceItinerary.execute(req.userId, tripIdParamsSchema.parse(req.params).id, body.revision, body));
  };
}
