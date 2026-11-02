import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../../../infra/database/client.js';
import { asUser, type Tx } from '../../../infra/database/scoped.js';
import { trips, tripSummaries, userTripStats, type TripRow } from '../../../infra/database/schema/index.js';
import { Trip, type TripProps } from '../domain/trip.entity.js';
import type { ListTripsQuery, TripRepository, TripSummary, UserTripStats } from '../domain/trip.repository.js';
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

function toPeriod(r: Pick<TripRow, 'periodMode' | 'periodMonth' | 'periodYear' | 'startDate' | 'endDate'>): Period | null {
  if (r.periodMode === 'indefinido') return { mode: 'indefinido' };
  if (r.periodMode === 'mes' && r.periodMonth && r.periodYear) return { mode: 'mes', month: r.periodMonth, year: r.periodYear };
  if (r.periodMode === 'definidas' && r.startDate) return { mode: 'definidas', startDate: r.startDate, endDate: r.endDate };
  return null;
}

export class DrizzleTripRepository implements TripRepository {
  constructor(private readonly db: Database) {}

  /** Toda consulta roda numa transação "como o usuário": o Postgres (RLS) só enxerga as linhas dele. */
  private run<T>(userId: string, fn: (db: Tx) => Promise<T>): Promise<T> {
    return asUser(this.db, userId, fn);
  }

  async create(trip: Trip): Promise<void> {
    return this.run(trip.toProps().userId, async (db) => {
      const p = trip.toProps();
      await db.insert(trips).values({
        id: p.id, userId: p.userId, status: p.status, archivedAt: p.archivedAt,
        ...this.contentColumns(trip),
        itinerary: p.itinerary, itineraryRevision: p.itineraryRevision,
        createdAt: p.createdAt, updatedAt: p.updatedAt,
      });
    });
  }

  async findById(id: string, userId: string): Promise<Trip | null> {
    return this.run(userId, async (db) => {
      const [row] = await db.select().from(trips).where(and(eq(trips.id, id), eq(trips.userId, userId))).limit(1);
      return row ? this.toDomain(row) : null;
    });
  }

  async list(userId: string, q: ListTripsQuery): Promise<TripSummary[]> {
    return this.run(userId, async (db) => {
      const t = tripSummaries;
      const conds = [
        eq(t.userId, userId),
        q.archived ? isNotNull(t.archivedAt) : isNull(t.archivedAt),
        ...(q.status ? [eq(t.status, q.status)] : []),
        ...(q.cursor
          ? [or(lt(t.updatedAt, q.cursor.updatedAt), and(eq(t.updatedAt, q.cursor.updatedAt), lt(t.id, q.cursor.id)))!]
          : []),
      ];
      const rows = await db.select().from(t).where(and(...conds)).orderBy(desc(t.updatedAt), desc(t.id)).limit(q.limit);
      return rows.map((r) => ({
        id: r.id, status: r.status as TripStatus, archivedAt: r.archivedAt, origin: r.origin,
        destinations: r.destinations as TripSummary['destinations'], companion: r.companion as TripSummary['companion'],
        period: toPeriod(r), days: r.days, budgetBrl: r.budgetBrl === null ? null : Number(r.budgetBrl),
        hasItinerary: r.hasItinerary, createdAt: r.createdAt, updatedAt: r.updatedAt,
      }));
    });
  }

  async statsForUser(userId: string): Promise<UserTripStats> {
    return this.run(userId, async (db) => {
      const [row] = await db.select().from(userTripStats).where(eq(userTripStats.userId, userId)).limit(1);
      return { trips: row?.tripsCompleted ?? 0, countries: row?.countriesVisited ?? 0, places: row?.placesVisited ?? 0 };
    });
  }

  async saveContent(trip: Trip, expectedStatus: TripStatus): Promise<boolean> {
    return this.run(trip.toProps().userId, async (db) => {
      const p = trip.toProps();
      const res = await db
        .update(trips)
        .set({ ...this.contentColumns(trip), updatedAt: p.updatedAt })
        .where(and(eq(trips.id, p.id), eq(trips.userId, p.userId), eq(trips.status, expectedStatus), inArray(trips.status, [...EDITABLE_STATUSES])))
        .returning({ id: trips.id });
      return res.length > 0;
    });
  }

  async transition(id: string, userId: string, from: TripStatus, to: TripStatus): Promise<boolean> {
    return this.run(userId, async (db) => {
      const res = await db
        .update(trips)
        .set({ status: to, updatedAt: new Date() })
        .where(and(eq(trips.id, id), eq(trips.userId, userId), eq(trips.status, from)))
        .returning({ id: trips.id });
      return res.length > 0;
    });
  }

  async setArchived(id: string, userId: string, archived: boolean): Promise<boolean> {
    return this.run(userId, async (db) => {
      const res = await db
        .update(trips)
        .set({ archivedAt: archived ? sql`coalesce(${trips.archivedAt}, now())` : null, updatedAt: new Date() })
        .where(and(eq(trips.id, id), eq(trips.userId, userId)))
        .returning({ id: trips.id });
      return res.length > 0;
    });
  }

  async saveItinerary(trip: Trip, expectedRevision: number): Promise<boolean> {
    return this.run(trip.toProps().userId, async (db) => {
      const p = trip.toProps();
      const res = await db
        .update(trips)
        .set({ itinerary: p.itinerary, itineraryRevision: p.itineraryRevision, updatedAt: p.updatedAt })
        .where(and(
          eq(trips.id, p.id), eq(trips.userId, p.userId),
          eq(trips.itineraryRevision, expectedRevision),
          inArray(trips.status, [...EDITABLE_STATUSES]),
        ))
        .returning({ id: trips.id });
      return res.length > 0;
    });
  }

  async syncStatusesByDate(userId: string, today: string): Promise<void> {
    return this.run(userId, async (db) => {
      // Function no banco: as duas etapas (começou -> em andamento; passou -> concluída) em uma só ida
      await db.execute(sql`select trips_sync_statuses(${userId}::uuid, ${today}::date)`);
    });
  }

  private contentColumns(trip: Trip) {
    const c = trip.content;
    return {
      origin: c.origin, climate: c.climate, reach: c.reach, companion: c.companion,
      experiences: c.experiences, needs: c.needs, destinations: c.destinations, likedPlaces: c.likedPlaces, dislikedPlaces: c.dislikedPlaces,
      planMode: c.planMode, budgetUnlimited: c.budgetUnlimited,
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
      destinations: r.destinations as TripProps['destinations'], likedPlaces: r.likedPlaces as TripProps['likedPlaces'], dislikedPlaces: r.dislikedPlaces as TripProps['dislikedPlaces'],
      planMode: r.planMode as TripProps['planMode'], budgetUnlimited: r.budgetUnlimited,
      period: toPeriod(r), days: r.days,
      budgetBrl: r.budgetBrl === null ? null : Number(r.budgetBrl),
      itinerary: (r.itinerary as Itinerary | null) ?? null, itineraryRevision: r.itineraryRevision,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
    return Trip.restore(props);
  }
}
