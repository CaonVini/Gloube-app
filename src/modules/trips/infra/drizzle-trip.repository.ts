import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../../../infra/database/client.js';
import { trips, type TripRow } from '../../../infra/database/schema/index.js';
import { Trip, type TripProps } from '../domain/trip.entity.js';
import type { ListTripsQuery, TripRepository } from '../domain/trip.repository.js';
import { EDITABLE_STATUSES } from '../domain/trip-rules.js';
import type { Itinerary, Period, TripStatus } from '../domain/trip.types.js';

function periodColumns(period: Period | null) {
  return {
    periodMode: period?.mode ?? null,
    periodMonth: period?.mode === 'mes' ? period.month : null,
    periodYear: period?.mode === 'mes' ? period.year : null,
    startDate: period?.mode === 'definidas' ? period.startDate : null,
    endDate: period?.mode === 'definidas' ? period.endDate : null,
  };
}

function toPeriod(r: TripRow): Period | null {
  if (r.periodMode === 'indefinido') return { mode: 'indefinido' };
  if (r.periodMode === 'mes' && r.periodMonth && r.periodYear) return { mode: 'mes', month: r.periodMonth, year: r.periodYear };
  if (r.periodMode === 'definidas' && r.startDate) return { mode: 'definidas', startDate: r.startDate, endDate: r.endDate };
  return null;
}

export class DrizzleTripRepository implements TripRepository {
  constructor(private readonly db: Database) {}

  async create(trip: Trip): Promise<void> {
    const p = trip.toProps();
    await this.db.insert(trips).values({
      id: p.id, userId: p.userId, status: p.status, archivedAt: p.archivedAt,
      ...this.contentColumns(trip),
      itinerary: p.itinerary, itineraryRevision: p.itineraryRevision,
      createdAt: p.createdAt, updatedAt: p.updatedAt,
    });
  }

  async findById(id: string, userId: string): Promise<Trip | null> {
    const [row] = await this.db.select().from(trips).where(and(eq(trips.id, id), eq(trips.userId, userId))).limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(userId: string, q: ListTripsQuery): Promise<Trip[]> {
    const conds = [
      eq(trips.userId, userId),
      q.archived ? isNotNull(trips.archivedAt) : isNull(trips.archivedAt),
      ...(q.status ? [eq(trips.status, q.status)] : []),
      ...(q.cursor
        ? [or(lt(trips.updatedAt, q.cursor.updatedAt), and(eq(trips.updatedAt, q.cursor.updatedAt), lt(trips.id, q.cursor.id)))!]
        : []),
    ];
    const rows = await this.db.select().from(trips).where(and(...conds)).orderBy(desc(trips.updatedAt), desc(trips.id)).limit(q.limit);
    return rows.map((r) => this.toDomain(r));
  }

  async saveContent(trip: Trip, expectedStatus: TripStatus): Promise<boolean> {
    const p = trip.toProps();
    const res = await this.db
      .update(trips)
      .set({ ...this.contentColumns(trip), updatedAt: p.updatedAt })
      .where(and(eq(trips.id, p.id), eq(trips.userId, p.userId), eq(trips.status, expectedStatus), inArray(trips.status, [...EDITABLE_STATUSES])))
      .returning({ id: trips.id });
    return res.length > 0;
  }

  async transition(id: string, userId: string, from: TripStatus, to: TripStatus): Promise<boolean> {
    const res = await this.db
      .update(trips)
      .set({ status: to, updatedAt: new Date() })
      .where(and(eq(trips.id, id), eq(trips.userId, userId), eq(trips.status, from)))
      .returning({ id: trips.id });
    return res.length > 0;
  }

  async setArchived(id: string, userId: string, archived: boolean): Promise<boolean> {
    const res = await this.db
      .update(trips)
      .set({ archivedAt: archived ? sql`coalesce(${trips.archivedAt}, now())` : null, updatedAt: new Date() })
      .where(and(eq(trips.id, id), eq(trips.userId, userId)))
      .returning({ id: trips.id });
    return res.length > 0;
  }

  async saveItinerary(trip: Trip, expectedRevision: number): Promise<boolean> {
    const p = trip.toProps();
    const res = await this.db
      .update(trips)
      .set({ itinerary: p.itinerary, itineraryRevision: p.itineraryRevision, updatedAt: p.updatedAt })
      .where(and(
        eq(trips.id, p.id), eq(trips.userId, p.userId),
        eq(trips.itineraryRevision, expectedRevision),
        inArray(trips.status, [...EDITABLE_STATUSES]),
      ))
      .returning({ id: trips.id });
    return res.length > 0;
  }

  async syncStatusesByDate(userId: string, today: string): Promise<void> {
    // Fim da viagem: volta, ou ida + dias (ou só a ida, sem duração). Só viagens com datas exatas mudam sozinhas.
    const lastDay = sql`coalesce(${trips.endDate}, ${trips.startDate} + coalesce(${trips.days}, 0))`;
    const started = and(eq(trips.userId, userId), eq(trips.status, 'planejada'), eq(trips.periodMode, 'definidas'), sql`${trips.startDate} <= ${today}::date`);
    await this.db.update(trips).set({ status: 'em_andamento', updatedAt: new Date() }).where(started);
    const finished = and(eq(trips.userId, userId), eq(trips.status, 'em_andamento'), eq(trips.periodMode, 'definidas'), sql`${lastDay} < ${today}::date`);
    await this.db.update(trips).set({ status: 'concluida', updatedAt: new Date() }).where(finished);
  }

  private contentColumns(trip: Trip) {
    const c = trip.content;
    return {
      origin: c.origin, climate: c.climate, reach: c.reach, companion: c.companion,
      experiences: c.experiences, needs: c.needs, destinations: c.destinations, likedPlaces: c.likedPlaces,
      ...periodColumns(c.period), days: c.days,
      budgetBrl: c.budgetBrl === null ? null : c.budgetBrl.toFixed(2),
    };
  }

  private toDomain(r: TripRow): Trip {
    const props: TripProps = {
      id: r.id, userId: r.userId, status: r.status as TripStatus, archivedAt: r.archivedAt,
      origin: r.origin, climate: r.climate as TripProps['climate'], reach: r.reach as TripProps['reach'],
      companion: r.companion as TripProps['companion'],
      experiences: r.experiences as TripProps['experiences'], needs: r.needs as TripProps['needs'],
      destinations: r.destinations as TripProps['destinations'], likedPlaces: r.likedPlaces as TripProps['likedPlaces'],
      period: toPeriod(r), days: r.days,
      budgetBrl: r.budgetBrl === null ? null : Number(r.budgetBrl),
      itinerary: (r.itinerary as Itinerary | null) ?? null, itineraryRevision: r.itineraryRevision,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
    return Trip.restore(props);
  }
}
