import type { TripRepository } from '../../domain/trip.repository.js';
import { loadOwnedTrip } from '../load-trip.js';
import { toTripDTO, type TripDTO } from '../dtos.js';

/** Arquivar não é excluir (não existe exclusão): só tira a viagem da lista padrão. Idempotente. */
export class SetTripArchivedUseCase {
  constructor(private readonly trips: TripRepository) {}

  async execute(userId: string, tripId: string, archived: boolean): Promise<TripDTO> {
    await loadOwnedTrip(this.trips, tripId, userId);
    await this.trips.setArchived(tripId, userId, archived);
    return toTripDTO(await loadOwnedTrip(this.trips, tripId, userId));
  }
}
