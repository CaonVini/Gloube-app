import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../src/config/env.js';
import { createDatabase, type DatabaseConnection } from '../src/infra/database/client.js';
import { buildApp } from '../src/app.js';
import { GooglePlacesProvider, kindFromTypes } from '../src/modules/places/infra/google-places-provider.js';
import type { PlacesProvider } from '../src/modules/places/application/places-provider.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('GooglePlacesProvider', () => {
  it('autocompleta cidades pedindo só o necessário e põe a chave no header (nunca na URL)', async () => {
    const fetchImpl = vi.fn(async () => json({
      suggestions: [
        { placePrediction: { placeId: 'ChIJ1', structuredFormat: { mainText: { text: 'Paris' }, secondaryText: { text: 'Île-de-France, França' } } } },
        { placePrediction: { placeId: '', text: { text: 'sem id' } } },
        {},
      ],
    }));
    const p = new GooglePlacesProvider({ apiKey: 'chave-secreta-123', fetchImpl });
    expect(await p.searchDestinations('par')).toEqual([{ ref: 'google:ChIJ1', city: 'Paris', country: 'França' }]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(url).not.toContain('chave-secreta');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('chave-secreta-123');
    expect(JSON.parse(init.body as string)).toMatchObject({ input: 'par', languageCode: 'pt-BR', includedPrimaryTypes: ['(cities)'] });
  });

  it('busca atrações com FieldMask mínimo e classifica a categoria', async () => {
    const fetchImpl = vi.fn(async () => json({
      places: [
        { id: 'a', displayName: { text: 'Museu do Louvre' }, primaryType: 'museum', types: ['museum'] },
        { id: 'b', displayName: { text: 'Jardim de Luxemburgo' }, types: ['park'] },
        { id: 'c', displayName: { text: 'Barco no Sena' }, types: ['point_of_interest'] },
        { displayName: { text: 'sem id' } },
      ],
    }));
    const p = new GooglePlacesProvider({ apiKey: 'chave-secreta-123', fetchImpl });
    const out = await p.searchAttractions('', 'Paris, França');
    expect(out.map((x) => [x.ref, x.kind])).toEqual([['google:a', 'museu'], ['google:b', 'natureza'], ['google:c', 'passeio']]);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-goog-fieldmask']).toBe('places.id,places.displayName,places.types,places.primaryType');
    expect(JSON.parse(init.body as string).textQuery).toBe('pontos turísticos em Paris, França');
  });

  it('erro do Google, timeout ou rede viram 503 genérico sem vazar detalhes', async () => {
    for (const impl of [async () => json({ error: { message: 'API key chave-secreta-123 inválida' } }, 403), async () => { throw new Error('boom chave-secreta-123'); }]) {
      const p = new GooglePlacesProvider({ apiKey: 'chave-secreta-123', fetchImpl: impl });
      const err = await p.searchDestinations('paris').catch((e: Error) => e);
      expect(err).toMatchObject({ code: 'UNAVAILABLE' });
      expect((err as Error).message).not.toContain('chave');
    }
  });

  it('mapeia tipos do Google para as categorias do app', () => {
    expect(kindFromTypes(['tourist_attraction'])).toBe('icone');
    expect(kindFromTypes(['restaurant'])).toBe('sabor');
    expect(kindFromTypes(['neighborhood'])).toBe('bairro');
    expect(kindFromTypes([])).toBe('passeio');
  });
});

describe('rotas /places', () => {
  let app: FastifyInstance;
  let conn: DatabaseConnection;
  let noKeyApp: FastifyInstance;
  let limitedApp: FastifyInstance;
  const calls: string[][] = [];
  const fake: PlacesProvider = {
    searchDestinations: async (q) => { calls.push(['d', q]); return [{ ref: 'google:x', city: 'Paris', country: 'França' }]; },
    searchAttractions: async (q, d) => { calls.push(['a', q, d]); return [{ ref: 'google:y', name: 'Louvre', kind: 'museu' }]; },
  };

  beforeAll(async () => {
    const env = loadEnv({ ...process.env, NODE_ENV: 'test', RATE_LIMIT_MAX: '100000', AUTH_RATE_LIMIT_MAX: '100000', PLACES_RATE_LIMIT_MAX: '1000', GOOGLE_PLACES_API_KEY: '' });
    conn = createDatabase(env.DATABASE_URL, 5);
    app = await buildApp(env, conn.db, { placesProvider: fake });
    noKeyApp = await buildApp(env, conn.db);
    limitedApp = await buildApp({ ...env, PLACES_RATE_LIMIT_MAX: 3 }, conn.db, { placesProvider: fake });
  });
  afterAll(async () => {
    await app.close();
    await noKeyApp.close();
    await limitedApp.close();
    await conn.close();
  });

  const token = async (a: FastifyInstance) =>
    (await a.inject({ method: 'POST', url: '/v1/auth/register', payload: { name: 'Busca Teste', email: `pl-${Date.now()}-${Math.random()}@example.com`, password: 'senha-forte-123' } })).json().tokens.accessToken as string;
  const get = (a: FastifyInstance, t: string | null, url: string) => a.inject({ method: 'GET', url, headers: t ? { authorization: `Bearer ${t}` } : {} });

  it('exige login (a chave do Google é nossa e a chamada é paga)', async () => {
    expect((await get(app, null, '/v1/places/destinations?q=paris')).statusCode).toBe(401);
  });

  it('valida a busca (tamanho, campos obrigatórios, caracteres de controle)', async () => {
    const t = await token(app);
    expect((await get(app, t, '/v1/places/destinations?q=p')).statusCode).toBe(400);
    expect((await get(app, t, '/v1/places/destinations')).statusCode).toBe(400);
    expect((await get(app, t, `/v1/places/destinations?q=${'a'.repeat(81)}`)).statusCode).toBe(400);
    expect((await get(app, t, '/v1/places/attractions?q=louvre')).statusCode).toBe(400);
    expect((await get(app, t, '/v1/places/destinations?q=pa%00ris')).statusCode).toBe(400);
  });

  it('devolve sugestões de destinos e de atrações', async () => {
    const t = await token(app);
    expect((await get(app, t, '/v1/places/destinations?q=%20paris%20')).json().items[0].ref).toBe('google:x');
    expect(calls.at(-1)).toEqual(['d', 'paris']);
    const a = await get(app, t, '/v1/places/attractions?destination=Paris,%20Fran%C3%A7a');
    expect(a.json().items[0]).toMatchObject({ name: 'Louvre', kind: 'museu' });
    expect(calls.at(-1)).toEqual(['a', '', 'Paris, França']);
  });

  it('limita chamadas por minuto (429) e responde 503 sem chave configurada', async () => {
    const t = await token(limitedApp);
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await get(limitedApp, t, '/v1/places/destinations?q=paris')).statusCode);
    expect(codes).toEqual([200, 200, 200, 429]);
    const t2 = await token(noKeyApp);
    expect((await get(noKeyApp, t2, '/v1/places/destinations?q=paris')).statusCode).toBe(503);
  });
});
