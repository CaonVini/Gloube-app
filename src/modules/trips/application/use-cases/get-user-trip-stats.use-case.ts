import type { TripRepository, UserTripStats } from '../../domain/trip.repository.js';
import { todayInBrazil } from '../../domain/trip-rules.js';

export class GetUserTripStatsUseCase {
  constructor(private readonly trips: TripRepository) {}

  /** "Realizada" = viagem concluída. Sincroniza antes, para uma viagem que acabou ontem já contar. */
  async execute(userId: string): Promise<UserTripStats> {
    await this.trips.syncStatusesByDate(userId, todayInBrazil());
    return this.trips.statsForUser(userId);
  }
}
