import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ServiceUnavailableError } from '../../../shared/errors/app-error.js';
import type { PlacesProvider } from '../application/places-provider.js';

// Sem caracteres de controle e com tamanho limitado: o texto vai para uma API paga
const text = (min: number, max: number) =>
  z.string().trim().min(min).max(max).refine((v) => !/[\u0000-\u001F\u007F]/.test(v), 'Caracteres inválidos');

const destinationsQuery = z.object({ q: text(2, 80) });
const attractionsQuery = z.object({ destination: text(2, 120), q: text(0, 80).default('') });

/** `provider` é nulo sem GOOGLE_PLACES_API_KEY: as rotas respondem 503 em vez de falhar na inicialização. */
export class PlacesController {
  constructor(private readonly provider: PlacesProvider | null) {}

  destinations = async (req: FastifyRequest, reply: FastifyReply) => {
    const { q } = destinationsQuery.parse(req.query);
    return reply.send({ items: await this.requireProvider().searchDestinations(q) });
  };

  attractions = async (req: FastifyRequest, reply: FastifyReply) => {
    const { q, destination } = attractionsQuery.parse(req.query);
    return reply.send({ items: await this.requireProvider().searchAttractions(q, destination) });
  };

  private requireProvider(): PlacesProvider {
    if (!this.provider) throw new ServiceUnavailableError('Busca de lugares não configurada');
    return this.provider;
  }
}
