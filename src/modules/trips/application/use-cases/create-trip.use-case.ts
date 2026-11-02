import { Trip, type TripContent } from '../../domain/trip.entity.js';
import type { TripRepository } from '../../domain/trip.repository.js';
import { todayInBrazil } from '../../domain/trip-rules.js';
import { assertValidContent } from '../trip-content-input.js';
import { toTripDTO, type TripDTO } from '../dtos.js';

export class CreateTripUseCase {
  constructor(private readonly trips: TripRepository) {}

  /** Cria sempre como rascunho: qualquer campo pode faltar, mas o que vier precisa ser válido. */
  async execute(userId: string, input: Partial<TripContent>): Promise<TripDTO> {
    const draft = Trip.createDraft(userId, {});
    const content = assertValidContent({ ...draft.content, ...input }, todayInBrazil());
    const trip = Trip.createDraft(userId, content);
    await this.trips.create(trip);
    return toTripDTO(trip);
  }
}
