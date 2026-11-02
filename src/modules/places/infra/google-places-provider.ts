import { ServiceUnavailableError } from '../../../shared/errors/app-error.js';
import type { PlaceKind } from '../../trips/domain/trip.types.js';
import type { AttractionSuggestion, DestinationSuggestion, PlacesProvider } from '../application/places-provider.js';

const BASE = 'https://places.googleapis.com/v1';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface AutocompleteResponse {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    };
  }[];
}
interface SearchTextResponse {
  places?: { id?: string; displayName?: { text?: string }; types?: string[]; primaryType?: string }[];
}

const KIND_BY_TYPE: [PlaceKind, readonly string[]][] = [
  ['museu', ['museum', 'art_gallery', 'library', 'historical_place', 'cultural_landmark']],
  ['natureza', ['park', 'national_park', 'natural_feature', 'garden', 'beach', 'hiking_area', 'zoo']],
  ['sabor', ['restaurant', 'cafe', 'bakery', 'food', 'market', 'bar']],
  ['bairro', ['neighborhood', 'sublocality', 'sublocality_level_1']],
  ['icone', ['tourist_attraction', 'landmark', 'monument', 'place_of_worship', 'church', 'castle']],
];

/** Tipo do Google -> categoria do app. O que não casa vira "passeio". */
export function kindFromTypes(types: readonly string[]): PlaceKind {
  for (const [kind, list] of KIND_BY_TYPE) if (types.some((t) => list.includes(t))) return kind;
  return 'passeio';
}

export interface GooglePlacesOptions {
  apiKey: string;
  languageCode?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

/**
 * Google Places API (New). A chave vai SÓ no header (nunca em URL, para não cair em log) e cada chamada pede
 * apenas os campos necessários via FieldMask (campos a mais mudam o SKU e o preço). Guardamos só o `place_id`
 * e o nome/categoria no momento da escolha, como os termos do Google permitem.
 */
export class GooglePlacesProvider implements PlacesProvider {
  private readonly lang: string;
  private readonly timeoutMs: number;
  private readonly doFetch: FetchLike;

  constructor(private readonly opts: GooglePlacesOptions) {
    this.lang = opts.languageCode ?? 'pt-BR';
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.doFetch = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  async searchDestinations(query: string): Promise<DestinationSuggestion[]> {
    const data = await this.post<AutocompleteResponse>('/places:autocomplete', '', {
      input: query,
      languageCode: this.lang,
      includedPrimaryTypes: ['(cities)'],
    });
    return (data.suggestions ?? []).flatMap((s) => {
      const p = s.placePrediction;
      const id = p?.placeId;
      const city = p?.structuredFormat?.mainText?.text ?? p?.text?.text;
      if (!id || !city) return [];
      const secondary = p?.structuredFormat?.secondaryText?.text ?? '';
      // "Île-de-France, França" -> o país é o último trecho
      const country = secondary.split(',').at(-1)?.trim() || '';
      return [{ ref: `google:${id}`, city, country }];
    }).slice(0, 5);
  }

  async searchAttractions(query: string, destination: string): Promise<AttractionSuggestion[]> {
    const data = await this.post<SearchTextResponse>('/places:searchText', 'places.id,places.displayName,places.types,places.primaryType', {
      textQuery: query ? `${query} em ${destination}` : `pontos turísticos em ${destination}`,
      languageCode: this.lang,
      pageSize: 10,
    });
    return (data.places ?? []).flatMap((p) => {
      const name = p.displayName?.text;
      if (!p.id || !name) return [];
      return [{ ref: `google:${p.id}`, name, kind: kindFromTypes([p.primaryType ?? '', ...(p.types ?? [])]) }];
    });
  }

  private async post<T>(path: string, fieldMask: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.doFetch(`${BASE}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.opts.apiKey,
          ...(fieldMask ? { 'x-goog-fieldmask': fieldMask } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ServiceUnavailableError('Busca de lugares indisponível no momento');
    }
    // Detalhes do erro do Google podem conter dados internos: não repassamos ao cliente
    if (!res.ok) throw new ServiceUnavailableError('Busca de lugares indisponível no momento');
    return (await res.json()) as T;
  }
}
