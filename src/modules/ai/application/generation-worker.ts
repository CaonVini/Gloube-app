import type { TripRepository } from '../../trips/domain/trip.repository.js';
import { EDITABLE_STATUSES } from '../../trips/domain/trip-rules.js';
import { AiProviderError, type AiProvider } from './ports/ai-provider.js';
import type { GenerationRepository } from './ports/generation.repository.js';
import { estimateCostUsd, type Prices } from './cost.js';
import { parseItineraryOutput } from './itinerary-output.js';
import type { PromptTemplate } from './prompts/index.js';
import type { Generation } from '../domain/generation.js';

export interface WorkerConfig {
  maxAttempts: number;
  maxOutputTokens: number;
  prices: Prices;
  pollMs: number;
  /** Uma geração `running` há mais que isso é considerada de um worker morto. */
  staleMs: number;
}

export class GenerationWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly generations: GenerationRepository,
    private readonly trips: TripRepository,
    private readonly provider: AiProvider,
    private readonly prompt: PromptTemplate,
    private readonly cfg: WorkerConfig,
    private readonly log: { error(obj: object, msg: string): void } = { error: () => {} },
  ) {}

  /** Processa no máximo uma geração. true = havia trabalho. */
  async runOnce(): Promise<boolean> {
    const gen = await this.generations.claimNext(this.cfg.maxAttempts, this.cfg.staleMs);
    if (!gen) return false;
    await this.process(gen);
    return true;
  }

  private async process(gen: Generation): Promise<void> {
    const started = Date.now();
    const elapsed = () => Date.now() - started;
    try {
      const out = await this.provider.complete({
        model: gen.model, system: this.prompt.system, user: this.prompt.user(gen.input), maxOutputTokens: this.cfg.maxOutputTokens,
      });
      const cost = estimateCostUsd(out.inputTokens, out.outputTokens, this.cfg.prices);
      // Os tokens já foram cobrados mesmo se a saída for inútil: registra o custo na falha também
      const usage = { inputTokens: out.inputTokens, outputTokens: out.outputTokens, costUsd: cost, durationMs: elapsed() };

      const itinerary = parseItineraryOutput(out.text, {
        totalDays: gen.input.totalDays,
        destinationRefs: new Set(gen.input.trip.destinations.map((d) => d.ref)),
        placeRefs: new Set(gen.input.trip.likedPlaces.map((p) => p.ref)),
      });
      if (!itinerary) return await this.generations.fail(gen.id, { errorCode: 'invalid_output', ...usage });

      // Só aplica se a viagem continua editável e o roteiro não foi editado desde o pedido
      const trip = await this.trips.findById(gen.tripId, gen.userId);
      let applied = false;
      if (trip && EDITABLE_STATUSES.includes(trip.status) && trip.itineraryRevision === gen.input.baseRevision) {
        applied = await this.trips.saveItinerary(trip.withItinerary(itinerary), gen.input.baseRevision);
      }
      await this.generations.complete(gen.id, { result: itinerary, applied, ...usage });
    } catch (err) {
      const retryable = err instanceof AiProviderError && err.retryable;
      if (retryable && gen.attempts < this.cfg.maxAttempts) return await this.generations.requeue(gen.id);
      const code = err instanceof AiProviderError ? (err.kind === 'timeout' ? 'provider_timeout' : 'provider_error') : 'provider_error';
      // Detalhe só no log do servidor (sem prompt, sem chave); o cliente vê apenas o código
      this.log.error({ generationId: gen.id, reason: err instanceof Error ? err.message : 'unknown' }, 'falha na geração por IA');
      await this.generations.fail(gen.id, { errorCode: code, durationMs: elapsed() });
    }
  }

  start(): void {
    if (this.timer) return;
    const tick = async () => {
      if (this.running) return;
      this.running = true;
      try {
        while (await this.runOnce()) { /* esvazia a fila */ }
      } catch (err) {
        this.log.error({ reason: err instanceof Error ? err.message : 'unknown' }, 'erro no worker de IA');
      } finally {
        this.running = false;
      }
    };
    this.timer = setInterval(() => void tick(), this.cfg.pollMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
