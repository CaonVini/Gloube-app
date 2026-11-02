import { describe, expect, it } from 'vitest';
import { useTripApp } from './helpers/trip-kit.js';

const k = useTripApp();
const { call, newUser, today, paris, roma, complete, addDays } = k;

describe('edição do roteiro', () => {
  it('outro usuário não edita o roteiro alheio (404)', async () => {
    const a = await newUser();
    const b = await newUser();
    const id = (await call(a, 'POST', '/trips', complete())).json().id;
    expect((await call(b, 'PUT', `/trips/${id}/itinerary`, { revision: 0, days: [] })).statusCode).toBe(404);
  });

  it('edição total com controle de revisão (sem sobrescrever edição de outro aparelho)', async () => {
    const a = await newUser();
    const id = (await call(a, 'POST', '/trips', complete())).json().id;
    const gen = (await call(a, 'POST', `/trips/${id}/itinerary/generate`, {})).json();
    const edited = {
      revision: gen.itineraryRevision,
      days: [
        { ...gen.itinerary.days[3], title: 'Dia livre no Marais', items: [{ text: 'Almoço com amigos', placeRef: null }] },
        gen.itinerary.days[0],
        { title: 'Dia novo', destinationRef: null, items: [] },
      ],
    };
    const ok = await call(a, 'PUT', `/trips/${id}/itinerary`, edited);
    expect(ok.statusCode).toBe(200);
    const saved = ok.json();
    expect(saved.itineraryRevision).toBe(gen.itineraryRevision + 1);
    expect(saved.itinerary.days.map((d: { title: string }) => d.title)).toEqual(['Dia livre no Marais', 'Chegada e primeiras impressões', 'Dia novo']);
    expect(saved.itinerary.days[2].id).toMatch(/^[0-9a-f-]{36}$/);
    // segunda gravação com a revisão antiga = conflito
    const stale = await call(a, 'PUT', `/trips/${id}/itinerary`, edited);
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.details.currentRevision).toBe(saved.itineraryRevision);
    expect((await call(a, 'GET', `/trips/${id}`)).json().itinerary.days).toHaveLength(3);
  });

  it('valida o roteiro editado (destino alheio, tamanhos, campos extras)', async () => {
    const a = await newUser();
    const id = (await call(a, 'POST', '/trips', complete())).json().id;
    const put = (days: unknown[]) => call(a, 'PUT', `/trips/${id}/itinerary`, { revision: 0, days });
    expect((await put([{ title: 'X', destinationRef: 'roma', items: [] }])).statusCode).toBe(400);
    expect((await put([{ title: '', destinationRef: null, items: [] }])).statusCode).toBe(400);
    expect((await put([{ title: 'X', destinationRef: null, items: Array.from({ length: 31 }, () => ({ text: 'a' })) }])).statusCode).toBe(400);
    expect((await put([{ title: 'X', destinationRef: null, items: [], extra: 1 }])).statusCode).toBe(400);
    expect((await put(Array.from({ length: 367 }, () => ({ title: 'X', destinationRef: null, items: [] })))).statusCode).toBe(400);
    expect((await put([{ title: 'Ok', destinationRef: 'paris', items: [{ text: '<script>alert(1)</script>' }] }])).statusCode).toBe(200);
  });

  it('não edita roteiro de viagem cancelada', async () => {
    const a = await newUser();
    const id = (await call(a, 'POST', '/trips', complete())).json().id;
    await call(a, 'POST', `/trips/${id}/status`, { status: 'cancelada' });
    expect((await call(a, 'PUT', `/trips/${id}/itinerary`, { revision: 0, days: [] })).statusCode).toBe(409);
  });
});
