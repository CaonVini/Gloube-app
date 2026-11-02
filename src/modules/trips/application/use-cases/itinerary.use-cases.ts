import { ConflictError } from '../../../../shared/errors/app-error.js';
import type { Trip } from '../../domain/trip.entity.js';
import type { TripRepository } from '../../domain/trip.repository.js';
import { generateItinerary } from '../../domain/itinerary-generator.js';
import { EDITABLE_STATUSES } from '../../domain/trip-rules.js';
import { loadOwnedTrip } from '../load-trip.js';
import { toTripDTO, type TripDTO } from '../dtos.js';

function assertEditable(trip: Trip): void {
  if (!EDITABLE_STATUSES.includes(trip.status)) {
    throw new ConflictError(`Viagem ${trip.status === 'concluida' ? 'concluída' : 'cancelada'} não pode ser editada`);
  }
}

export class GenerateItineraryUseCase {
  constructor(private readonly trips: TripRepository) {}

  /** Gera o roteiro inicial. Se já existe (possivelmente editado), só substitui com `replace: true`. */
  async execute(userId: string, tripId: string, replace: boolean): Promise<TripDTO> {
    const trip = await loadOwnedTrip(this.trips, tripId, userId);
    assertEditable(trip);
    if (trip.itinerary && !replace) {
      throw new ConflictError('A viagem já tem roteiro. Envie replace=true para substituí-lo (as edições serão perdidas).');
    }
    const updated = trip.withItinerary(generateItinerary(trip.content));
    if (!(await this.trips.saveItinerary(updated, trip.itineraryRevision))) {
      throw new ConflictError('O roteiro mudou durante a geração. Recarregue e tente de novo.');
    }
    return toTripDTO(updated);
  }
}
