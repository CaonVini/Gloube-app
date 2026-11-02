import { randomUUID } from 'node:crypto';
import { ConflictError, RateLimitedError, ServiceUnavailableError } from '../../../../shared/errors/app-error.js';
import type { TripRepository } from '../../../trips/domain/trip.repository.js';
import { loadOwnedTrip } from '../../../trips/application/load-trip.js';
import { generateItinerary } from '../../../trips/domain/itinerary-generator.js';
import { EDITABLE_STATUSES, resolveDays, todayInBrazil } from '../../../trips/domain/trip-rules.js';
import type { Generation, GenerationInput } from '../../domain/generation.js';
import type { GenerationRepository } from '../ports/generation.repository.js';
import { toGenerationDTO } from '../generation-dto.js';

export interface EnqueueConfig {
  /** null = IA não configurada (sem chave/modelo/prompt válido) */
  model: string | null;
  promptVersion: string;
  dailyLimitPerUser: number;
}

export class EnqueueGenerationUseCase {
  constructor(private readonly trips: TripRepository, private readonly generations: GenerationRepository, private readonly cfg: EnqueueConfig) {}

  async execute(userId: string, tripId: string, replace: boolean) {
    if (!this.cfg.model) throw new ServiceUnavailableError('Geração por IA não está configurada');
    const trip = await loadOwnedTrip(this.trips, tripId, userId); // 404 se não for do usuário
    if (!EDITABLE_STATUSES.includes(trip.status)) throw new ConflictError('Viagem encerrada não pode ter roteiro gerado');
    if (trip.itinerary && !replace) {
      throw new ConflictError('A viagem já tem roteiro. Envie replace=true para substituí-lo (as edições serão perdidas).');
    }
    const c = trip.content;
    const preview = generateItinerary(c); // também valida duração/destinos (ValidationError)
    const totalDays = resolveDays(c.period, c.days)!;

    // Teto diário por usuário (custo): o dia vira à meia-noite de Brasília (UTC-3, sem horário de verão)
    const since = new Date(`${todayInBrazil()}T00:00:00-03:00`);
    if ((await this.generations.countSince(userId, since)) >= this.cfg.dailyLimitPerUser) {
      throw new RateLimitedError(`Limite diário de ${this.cfg.dailyLimitPerUser} gerações por IA atingido. Tente amanhã.`);
    }

    const input: GenerationInput = {
      baseRevision: trip.itineraryRevision,
      totalDays,
      trip: {
        origin: c.origin, destinations: c.destinations, companion: c.companion, climate: c.climate, reach: c.reach,
        experiences: c.experiences, needs: c.needs, likedPlaces: c.likedPlaces, dislikedPlaces: c.dislikedPlaces, planMode: c.planMode,
        budgetUnlimited: c.budgetUnlimited, period: c.period, budgetBrlPerPerson: c.budgetBrl,
      },
      preview,
    };
    const gen: Generation = {
      id: randomUUID(), userId, tripId, status: 'queued', model: this.cfg.model, promptVersion: this.cfg.promptVersion, input,
      applied: false, attempts: 0, inputTokens: null, outputTokens: null, costUsd: null, durationMs: null, errorCode: null,
      createdAt: new Date(), startedAt: null, finishedAt: null,
    };
    if (!(await this.generations.enqueue(gen))) throw new ConflictError('Já existe uma geração em andamento para esta viagem');
    return toGenerationDTO(gen);
  }
}
