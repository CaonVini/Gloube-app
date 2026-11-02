export const TRIP_STATUSES = ['rascunho', 'planejada', 'em_andamento', 'concluida', 'cancelada'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

// Valores idênticos aos do app (src/domain/discover/types.ts)
export const CLIMATES = ['frio', 'calor', 'tanto-faz'] as const;
export const REACHES = ['perto', 'brasil', 'internacional'] as const;
export const COMPANIONS = ['casal', 'amigos', 'familia', 'solo'] as const;
export const EXPERIENCES = ['praia', 'montanha', 'cidade', 'natureza', 'neve'] as const;
export const NEEDS = ['criancas', 'idosos', 'acessibilidade', 'pets'] as const;
export type Climate = (typeof CLIMATES)[number];
export type Reach = (typeof REACHES)[number];
export type Companion = (typeof COMPANIONS)[number];
export type Experience = (typeof EXPERIENCES)[number];
export type Need = (typeof NEEDS)[number];

export const MAX_DESTINATIONS = 10;

/** Datas sempre em ISO `YYYY-MM-DD` (o app mostra DD/MM/AAAA, mas a API não depende de máscara). */
export type Period =
  | { mode: 'indefinido' }
  | { mode: 'mes'; month: number; year: number }
  | { mode: 'definidas'; startDate: string; endDate: string | null };

/** Origem/destinos ainda sem catálogo definido: guardamos a referência externa + nome (snapshot). */
export interface Destination {
  ref: string;
  city: string;
  country: string;
}

export const PLACE_KINDS = ['icone', 'museu', 'natureza', 'passeio', 'sabor', 'bairro'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export interface LikedPlace {
  ref: string;
  name: string;
  kind: PlaceKind;
  /** `ref` do destino ao qual o lugar pertence. */
  destinationRef: string;
}

export interface ItineraryItem {
  id: string;
  text: string;
  placeRef: string | null;
}

export interface ItineraryDay {
  id: string;
  title: string;
  destinationRef: string | null;
  items: ItineraryItem[];
}

export interface Itinerary {
  days: ItineraryDay[];
}

/** Teto técnico do roteiro (geração e edição): protege CPU/memória/tamanho da linha. Não limita a viagem em si. */
export const MAX_ITINERARY_DAYS = 366;
export const MAX_ITEMS_PER_DAY = 30;
