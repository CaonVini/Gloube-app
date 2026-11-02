import type { Generation, GenerationErrorCode, UserAiUsage } from '../../domain/generation.js';
import type { Itinerary } from '../../../trips/domain/trip.types.js';

export interface CompleteData {
  result: Itinerary;
  applied: boolean;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  durationMs: number;
}

export interface FailData {
  errorCode: GenerationErrorCode;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number | null;
  durationMs: number;
}

export interface GenerationRepository {
  /** false = já existe geração ativa para a viagem (índice único parcial). */
  enqueue(g: Generation): Promise<boolean>;
  countSince(userId: string, since: Date): Promise<number>;
  /**
   * Pega a próxima geração da fila de forma atômica (`FOR UPDATE SKIP LOCKED`): vários workers nunca pegam a mesma.
   * Também recupera gerações presas em `running` há mais de `staleMs` (worker que morreu).
   */
  claimNext(maxAttempts: number, staleMs: number): Promise<Generation | null>;
  complete(id: string, data: CompleteData): Promise<void>;
  fail(id: string, data: FailData): Promise<void>;
  /** Devolve à fila para nova tentativa (falha transitória). */
  requeue(id: string): Promise<void>;
  findById(id: string, userId: string): Promise<Generation | null>;
  listForTrip(tripId: string, userId: string, limit: number): Promise<Generation[]>;
  usageForUser(userId: string): Promise<UserAiUsage>;
}
