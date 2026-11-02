import { ConflictError, ValidationError } from '../../../../shared/errors/app-error.js';
import type { TripContent } from '../../domain/trip.entity.js';
import type { TripRepository } from '../../domain/trip.repository.js';
import { EDITABLE_STATUSES, todayInBrazil } from '../../domain/trip-rules.js';
import { assertValidContent } from '../trip-content-input.js';
import { loadOwnedTrip } from '../load-trip.js';
import { toTripDTO, type TripDTO } from '../dtos.js';

export class UpdateTripUseCase {
  constructor(private readonly trips: TripRepository) {}

  /** Só os campos enviados mudam; `null` limpa (campos opcionais). */
  async execute(userId: string, tripId: string, changes: Partial<TripContent>): Promise<TripDTO> {
    const trip = await loadOwnedTrip(this.trips, tripId, userId);
    if (!EDITABLE_STATUSES.includes(trip.status)) {
      throw new ConflictError(`Viagem ${trip.status === 'concluida' ? 'concluída' : 'cancelada'} não pode ser editada`);
    }

    const merged: TripContent = { ...trip.content, ...changes };
    // O período só é revalidado se mudou: uma viagem em andamento tem ida no passado e continua editável
    const periodChanged = changes.period !== undefined && JSON.stringify(changes.period) !== JSON.stringify(trip.content.period);
    const content = assertValidContent(merged, todayInBrazil(), { checkPeriod: periodChanged });

    if (Object.keys(changes).length === 0) throw new ValidationError('Informe ao menos um campo');

    const updated = trip.withContent(content);
    const ok = await this.trips.saveContent(updated, trip.status);
    if (!ok) throw new ConflictError('A viagem mudou durante a edição. Recarregue e tente de novo.');
    return toTripDTO(updated);
  }
}
