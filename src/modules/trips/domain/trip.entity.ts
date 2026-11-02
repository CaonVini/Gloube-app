import { randomUUID } from 'node:crypto';
import type {
  Climate, Companion, PlanMode, Destination, Experience, Itinerary, LikedPlace, Need, Period, Reach, TripStatus,
} from './trip.types.js';

export interface TripProps {
  id: string;
  userId: string;
  status: TripStatus;
  archivedAt: Date | null;
  origin: string | null;
  climate: Climate | null;
  reach: Reach | null;
  companion: Companion | null;
  experiences: Experience[];
  needs: Need[];
  destinations: Destination[];
  likedPlaces: LikedPlace[];
  /** Cards que o usuário NÃO curtiu (a IA evita esses lugares). */
  dislikedPlaces: LikedPlace[];
  planMode: PlanMode | null;
  /** true = escolheu "sem limite de orçamento" (diferente de ainda não ter respondido). Exclusivo com budgetBrl. */
  budgetUnlimited: boolean;
  period: Period | null;
  days: number | null;
  /** Reais por pessoa; null = sem limite definido (ou ainda não informado). */
  budgetBrl: number | null;
  itinerary: Itinerary | null;
  itineraryRevision: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Campos editáveis pelo usuário (tudo que não é status/arquivo/roteiro). */
export type TripContent = Pick<
  TripProps,
  'origin' | 'climate' | 'reach' | 'companion' | 'experiences' | 'needs' | 'destinations' | 'likedPlaces' | 'dislikedPlaces' | 'planMode' | 'budgetUnlimited' | 'period' | 'days' | 'budgetBrl'
>;

export class Trip {
  private constructor(private readonly props: TripProps) {}

  static createDraft(userId: string, content: Partial<TripContent>): Trip {
    const now = new Date();
    return new Trip({
      id: randomUUID(),
      userId,
      status: 'rascunho',
      archivedAt: null,
      origin: content.origin ?? null,
      climate: content.climate ?? null,
      reach: content.reach ?? null,
      companion: content.companion ?? null,
      experiences: content.experiences ?? [],
      needs: content.needs ?? [],
      destinations: content.destinations ?? [],
      likedPlaces: content.likedPlaces ?? [],
      dislikedPlaces: content.dislikedPlaces ?? [],
      planMode: content.planMode ?? null,
      budgetUnlimited: content.budgetUnlimited ?? false,
      period: content.period ?? null,
      days: content.days ?? null,
      budgetBrl: content.budgetBrl ?? null,
      itinerary: null,
      itineraryRevision: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: TripProps): Trip {
    return new Trip({ ...props });
  }

  withContent(changes: Partial<TripContent>): Trip {
    return new Trip({ ...this.props, ...changes, updatedAt: new Date() });
  }

  withStatus(status: TripStatus): Trip {
    return new Trip({ ...this.props, status, updatedAt: new Date() });
  }

  withItinerary(itinerary: Itinerary): Trip {
    return new Trip({ ...this.props, itinerary, itineraryRevision: this.props.itineraryRevision + 1, updatedAt: new Date() });
  }

  toProps(): TripProps {
    return { ...this.props };
  }

  get id() { return this.props.id; }
  get userId() { return this.props.userId; }
  get status() { return this.props.status; }
  get content(): TripContent {
    const p = this.props;
    return {
      origin: p.origin, climate: p.climate, reach: p.reach, companion: p.companion, experiences: p.experiences,
      needs: p.needs, destinations: p.destinations, likedPlaces: p.likedPlaces, dislikedPlaces: p.dislikedPlaces, planMode: p.planMode,
      budgetUnlimited: p.budgetUnlimited, period: p.period, days: p.days, budgetBrl: p.budgetBrl,
    };
  }
  get itinerary() { return this.props.itinerary; }
  get itineraryRevision() { return this.props.itineraryRevision; }
  get archivedAt() { return this.props.archivedAt; }
}
