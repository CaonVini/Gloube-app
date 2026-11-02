import type { PlaceKind } from '../../trips/domain/trip.types.js';

export interface DestinationSuggestion {
  /** Referência estável gravada na viagem (`google:<place_id>`). */
  ref: string;
  city: string;
  country: string;
}

export interface AttractionSuggestion {
  ref: string;
  name: string;
  kind: PlaceKind;
}

/** Porta da fonte de lugares (hoje Google Places). Trocar de fonte não muda controller nem viagem. */
export interface PlacesProvider {
  searchDestinations(query: string): Promise<DestinationSuggestion[]>;
  /** `destination` é o texto "Cidade, País" do destino escolhido. */
  searchAttractions(query: string, destination: string): Promise<AttractionSuggestion[]>;
}
