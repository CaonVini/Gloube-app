import type { Trip } from '../domain/trip.entity.js';
import type { TripSummary } from '../domain/trip.repository.js';

/** Allow-list explícita: o que não está aqui nunca sai na API. */
export function toTripDTO(trip: Trip) {
  const p = trip.toProps();
  return {
    id: p.id,
    status: p.status,
    archived: p.archivedAt !== null,
    archivedAt: p.archivedAt?.toISOString() ?? null,
    origin: p.origin,
    climate: p.climate,
    reach: p.reach,
    companion: p.companion,
    experiences: p.experiences,
    needs: p.needs,
    destinations: p.destinations,
    likedPlaces: p.likedPlaces,
    period: p.period,
    days: p.days,
    budgetBrl: p.budgetBrl,
    itinerary: p.itinerary,
    itineraryRevision: p.itineraryRevision,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
export type TripDTO = ReturnType<typeof toTripDTO>;

export function toTripSummaryDTO(t: TripSummary) {
  return {
    id: t.id,
    status: t.status,
    archived: t.archivedAt !== null,
    origin: t.origin,
    destinations: t.destinations,
    companion: t.companion,
    period: t.period,
    days: t.days,
    budgetBrl: t.budgetBrl,
    hasItinerary: t.hasItinerary,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
export type TripSummaryDTO = ReturnType<typeof toTripSummaryDTO>;
