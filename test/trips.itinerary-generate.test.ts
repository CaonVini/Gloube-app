import { describe, expect, it } from 'vitest';
import { useTripApp } from './helpers/trip-kit.js';

const k = useTripApp();
const { call, newUser, today, paris, roma, complete, addDays } = k;

describe('roteiro gerado', () => {
  const places = [
    { ref: 'paris:torre-eiffel', name: 'Torre Eiffel', kind: 'icone', destinationRef: 'paris' },
    { ref: 'paris:louvre', name: 'Museu do Louvre', kind: 'museu', destinationRef: 'paris' },
    { ref: 'roma:coliseu', name: 'Coliseu', kind: 'icone', destinationRef: 'roma' },
  ];

  it('outro usuário não gera roteiro da viagem alheia (404)', async () => {
    const a = await newUser();
    const b = await newUser();
    const id = (await call(a, 'POST', '/trips', complete())).json().id;
    expect((await call(b, 'POST', `/trips/${id}/itinerary/generate`, {})).statusCode).toBe(404);
  });

  it('gera dias a partir dos lugares curtidos (chegada, lugares, volta)', async () => {
    const a = await newUser();
    const id = (await call(a, 'POST', '/trips', complete({ likedPlaces: [places[0], places[1]], experiences: ['cidade'] }))).json().id;
    const res = await call(a, 'POST', `/trips/${id}/itinerary/generate`, {});
    expect(res.statusCode).toBe(200);
    const it = res.json();
    expect(it.itineraryRevision).toBe(1);
    expect(it.itinerary.days).toHaveLength(7);
    expect(it.itinerary.days[0].title).toBe('Chegada e primeiras impressões');
    expect(it.itinerary.days[6].title).toBe('Últimos passeios e volta');
    const all = it.itinerary.days.flatMap((d: { items: { text: string }[] }) => d.items.map((i) => i.text));
    expect(all).toEqual(expect.arrayContaining(['Visita: Torre Eiffel', 'Visita: Museu do Louvre']));
  });

  it('divide os dias entre destinos na ordem e usa os lugares de cada um', async () => {
    const a = await newUser();
    const id = (await call(a, 'POST', '/trips', complete({
      destinations: [paris, roma], likedPlaces: places,
      period: { mode: 'definidas', startDate: addDays(today, 10), endDate: addDays(today, 19) },
    }))).json().id;
    const days = (await call(a, 'POST', `/trips/${id}/itinerary/generate`, {})).json().itinerary.days;
    expect(days).toHaveLength(9);
    expect(days.slice(0, 5).every((d: { destinationRef: string }) => d.destinationRef === 'paris')).toBe(true);
    expect(days.slice(5).every((d: { destinationRef: string }) => d.destinationRef === 'roma')).toBe(true);
    expect(JSON.stringify(days.slice(5))).toContain('Coliseu');
    expect(JSON.stringify(days.slice(0, 5))).not.toContain('Coliseu');
  });

  it('não sobrescreve roteiro existente sem replace, e recusa mais destinos que dias', async () => {
    const a = await newUser();
    const id = (await call(a, 'POST', '/trips', complete())).json().id;
    await call(a, 'POST', `/trips/${id}/itinerary/generate`, {});
    expect((await call(a, 'POST', `/trips/${id}/itinerary/generate`, {})).statusCode).toBe(409);
    expect((await call(a, 'POST', `/trips/${id}/itinerary/generate`, { replace: true })).json().itineraryRevision).toBe(2);
    const few = (await call(a, 'POST', '/trips', { destinations: [paris, roma], days: 1 })).json().id;
    expect((await call(a, 'POST', `/trips/${few}/itinerary/generate`, {})).statusCode).toBe(400);
    const none = (await call(a, 'POST', '/trips', { destinations: [paris] })).json().id;
    expect((await call(a, 'POST', `/trips/${none}/itinerary/generate`, {})).statusCode).toBe(400);
  });

  it('não gera roteiro de viagem cancelada', async () => {
    const a = await newUser();
    const id = (await call(a, 'POST', '/trips', complete())).json().id;
    await call(a, 'POST', `/trips/${id}/status`, { status: 'cancelada' });
    expect((await call(a, 'POST', `/trips/${id}/itinerary/generate`, {})).statusCode).toBe(409);
  });
});
