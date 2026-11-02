import { randomUUID } from 'node:crypto';
import { ConflictError, ValidationError } from '../../../../shared/errors/app-error.js';
import type { Trip } from '../../domain/trip.entity.js';
import type { TripRepository } from '../../domain/trip.repository.js';
import { generateItinerary } from '../../domain/itinerary-generator.js';
import { EDITABLE_STATUSES } from '../../domain/trip-rules.js';
import { MAX_ITEMS_PER_DAY, MAX_ITINERARY_DAYS, type Itinerary } from '../../domain/trip.types.js';
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

export interface ItineraryInput {
  days: { id?: string; title: string; destinationRef: string | null; items: { id?: string; text: string; placeRef: string | null }[] }[];
}

export class ReplaceItineraryUseCase {
  constructor(private readonly trips: TripRepository) {}

  /**
   * Edição total do roteiro: o cliente envia o roteiro inteiro (adicionar/remover/reordenar dias e itens, editar textos).
   * `revision` evita sobrescrever uma edição feita em outro aparelho.
   */
  async execute(userId: string, tripId: string, revision: number, input: ItineraryInput): Promise<TripDTO> {
    const trip = await loadOwnedTrip(this.trips, tripId, userId);
    assertEditable(trip);
    if (input.days.length > MAX_ITINERARY_DAYS) throw new ValidationError(`O roteiro suporta até ${MAX_ITINERARY_DAYS} dias`);
    if (input.days.some((d) => d.items.length > MAX_ITEMS_PER_DAY)) {
      throw new ValidationError(`Cada dia suporta até ${MAX_ITEMS_PER_DAY} itens`);
    }
    const refs = new Set(trip.content.destinations.map((d) => d.ref));
    if (input.days.some((d) => d.destinationRef !== null && !refs.has(d.destinationRef))) {
      throw new ValidationError('Dia aponta para um destino que não está na viagem');
    }
    if (revision !== trip.itineraryRevision) {
      throw new ConflictError('O roteiro foi alterado em outro lugar. Recarregue antes de salvar.', { currentRevision: trip.itineraryRevision });
    }

    const itinerary: Itinerary = {
      days: input.days.map((d) => ({
        id: d.id ?? randomUUID(),
        title: d.title,
        destinationRef: d.destinationRef,
        items: d.items.map((i) => ({ id: i.id ?? randomUUID(), text: i.text, placeRef: i.placeRef })),
      })),
    };
    const updated = trip.withItinerary(itinerary);
    if (!(await this.trips.saveItinerary(updated, revision))) {
      throw new ConflictError('O roteiro foi alterado em outro lugar. Recarregue antes de salvar.');
    }
    return toTripDTO(updated);
  }
}
