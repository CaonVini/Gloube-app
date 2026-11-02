import { ConflictError } from '../../../../shared/errors/app-error.js';
import type { TripRepository } from '../../domain/trip.repository.js';
import type { TripStatus } from '../../domain/trip.types.js';
import { assertReadyToPlan } from '../../domain/trip-completeness.js';
import { canTransition, todayInBrazil } from '../../domain/trip-rules.js';
import { loadOwnedTrip } from '../load-trip.js';
import { toTripDTO, type TripDTO } from '../dtos.js';

export class ChangeTripStatusUseCase {
  constructor(private readonly trips: TripRepository) {}

  async execute(userId: string, tripId: string, to: TripStatus): Promise<TripDTO> {
    const trip = await loadOwnedTrip(this.trips, tripId, userId);
    if (!canTransition(trip.status, to)) {
      throw new ConflictError(`Não é possível mudar de ${trip.status} para ${to}`);
    }
    if (to === 'planejada') assertReadyToPlan(trip.content, todayInBrazil());

    // Condicionada ao status lido: duas mudanças simultâneas não se atropelam
    const ok = await this.trips.transition(trip.id, userId, trip.status, to);
    if (!ok) throw new ConflictError('O status da viagem mudou. Recarregue e tente de novo.');
    return toTripDTO(await loadOwnedTrip(this.trips, tripId, userId));
  }
}
