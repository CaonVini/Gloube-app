import type { Trip } from './trip.entity.js';
import type { TripStatus } from './trip.types.js';

export interface ListTripsQuery {
  status?: TripStatus;
  archived: boolean;
  limit: number;
  /** Cursor opaco devolvido pela página anterior. */
  cursor?: { updatedAt: Date; id: string };
}

/**
 * Toda consulta recebe `userId`: um usuário nunca alcança a viagem de outro (resposta é sempre "não encontrada").
 * As escritas são pontuais e condicionais para não sobrescrever mudanças concorrentes.
 */
export interface TripRepository {
  create(trip: Trip): Promise<void>;
  findById(id: string, userId: string): Promise<Trip | null>;
  list(userId: string, query: ListTripsQuery): Promise<Trip[]>;
  /** Grava só o conteúdo, se o status ainda for `expectedStatus`. false = mudou no meio (conflito). */
  saveContent(trip: Trip, expectedStatus: TripStatus): Promise<boolean>;
  /** Troca de status condicionada ao status anterior. */
  transition(id: string, userId: string, from: TripStatus, to: TripStatus): Promise<boolean>;
  setArchived(id: string, userId: string, archived: boolean): Promise<boolean>;
  /** Grava o roteiro só se a revisão ainda for `expectedRevision` e o status permitir edição. */
  saveItinerary(trip: Trip, expectedRevision: number): Promise<boolean>;
  /** Avança status por data (planejada -> em andamento -> concluída) apenas para as viagens do usuário. */
  syncStatusesByDate(userId: string, today: string): Promise<void>;
}
