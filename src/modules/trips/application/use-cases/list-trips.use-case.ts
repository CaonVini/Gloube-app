import { ValidationError } from '../../../../shared/errors/app-error.js';
import type { TripRepository } from '../../domain/trip.repository.js';
import type { TripStatus } from '../../domain/trip.types.js';
import { todayInBrazil } from '../../domain/trip-rules.js';
import { toTripSummaryDTO, type TripSummaryDTO } from '../dtos.js';

export interface ListTripsInput {
  status?: TripStatus;
  archived: boolean;
  limit: number;
  cursor?: string;
}

export function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(`${updatedAt.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(raw: string): { updatedAt: Date; id: string } {
  const [iso, id] = Buffer.from(raw, 'base64url').toString().split('|');
  const date = new Date(iso ?? '');
  if (!iso || !id || Number.isNaN(date.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError('Cursor inválido');
  return { updatedAt: date, id };
}

export class ListTripsUseCase {
  constructor(private readonly trips: TripRepository) {}

  /** Paginação por cursor (keyset): custo constante por página, sem OFFSET. */
  async execute(userId: string, input: ListTripsInput): Promise<{ items: TripSummaryDTO[]; nextCursor: string | null }> {
    await this.trips.syncStatusesByDate(userId, todayInBrazil());
    const rows = await this.trips.list(userId, {
      status: input.status,
      archived: input.archived,
      limit: input.limit + 1,
      cursor: input.cursor ? decodeCursor(input.cursor) : undefined,
    });
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    const hasMore = rows.length > input.limit && last;
    return {
      items: page.map(toTripSummaryDTO),
      nextCursor: hasMore ? encodeCursor(last.toProps().updatedAt, last.id) : null,
    };
  }
}
