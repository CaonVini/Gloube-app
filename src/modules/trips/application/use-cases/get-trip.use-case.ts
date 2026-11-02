import type { TripRepository } from '../../domain/trip.repository.js';
import { loadOwnedTrip } from '../load-trip.js';
import { toTripDTO, type TripDTO } from '../dtos.js';

export class GetTripUseCase {
  constructor(private readonly trips: TripRepository) {}
  async execute(userId: string, tripId: string): Promise<TripDTO> {
    return toTripDTO(await loadOwnedTrip(this.trips, tripId, userId));
  }
}
