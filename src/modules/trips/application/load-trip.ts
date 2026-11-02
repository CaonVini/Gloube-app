import { NotFoundError } from '../../../shared/errors/app-error.js';
import type { Trip } from '../domain/trip.entity.js';
import type { TripRepository } from '../domain/trip.repository.js';
import { todayInBrazil } from '../domain/trip-rules.js';

/** Aplica as transições automáticas por data e carrega a viagem do dono (de outro usuário = 404, sem vazar existência). */
export async function loadOwnedTrip(repo: TripRepository, id: string, userId: string): Promise<Trip> {
  await repo.syncStatusesByDate(userId, todayInBrazil());
  const trip = await repo.findById(id, userId);
  if (!trip) throw new NotFoundError('Viagem não encontrada');
  return trip;
}
