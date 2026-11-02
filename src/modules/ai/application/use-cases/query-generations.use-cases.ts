import { NotFoundError } from '../../../../shared/errors/app-error.js';
import type { TripRepository } from '../../../trips/domain/trip.repository.js';
import { loadOwnedTrip } from '../../../trips/application/load-trip.js';
import { todayInBrazil } from '../../../trips/domain/trip-rules.js';
import type { GenerationRepository } from '../ports/generation.repository.js';
import { toGenerationDTO } from '../generation-dto.js';

export class GetGenerationUseCase {
  constructor(private readonly generations: GenerationRepository) {}
  async execute(userId: string, id: string) {
    const g = await this.generations.findById(id, userId);
    if (!g) throw new NotFoundError('Geração não encontrada');
    return toGenerationDTO(g);
  }
}

export class ListTripGenerationsUseCase {
  constructor(private readonly trips: TripRepository, private readonly generations: GenerationRepository) {}
  async execute(userId: string, tripId: string) {
    await loadOwnedTrip(this.trips, tripId, userId);
    return { items: (await this.generations.listForTrip(tripId, userId, 20)).map(toGenerationDTO) };
  }
}

export class GetAiUsageUseCase {
  constructor(private readonly generations: GenerationRepository, private readonly dailyLimit: number) {}
  async execute(userId: string) {
    const [total, today] = await Promise.all([
      this.generations.usageForUser(userId),
      this.generations.countSince(userId, new Date(`${todayInBrazil()}T00:00:00-03:00`)),
    ]);
    return { ...total, today: { generations: today, limit: this.dailyLimit } };
  }
}
