import type { Itinerary } from '../../trips/domain/trip.types.js';

export const GENERATION_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

/** Códigos de falha estáveis (aparecem na API e nas views de custo; nunca mensagens cruas do provedor). */
export type GenerationErrorCode = 'provider_error' | 'provider_timeout' | 'invalid_output' | 'trip_unavailable' | 'worker_timeout';

/** Tudo que é enviado à IA. Fica gravado na geração: auditável e reproduzível. */
export interface GenerationInput {
  /** Revisão do roteiro no momento do pedido: se o usuário editar depois, o resultado da IA não sobrescreve. */
  baseRevision: number;
  totalDays: number;
  trip: {
    origin: string | null;
    destinations: { ref: string; city: string; country: string }[];
    companion: string | null;
    climate: string | null;
    reach: string | null;
    experiences: string[];
    needs: string[];
    likedPlaces: { ref: string; name: string; kind: string; destinationRef: string }[];
    period: unknown;
    budgetBrlPerPerson: number | null;
  };
  /** Prévia determinística (a mesma do app) usada como ponto de partida. */
  preview: Itinerary;
}

export interface Generation {
  id: string;
  userId: string;
  tripId: string;
  status: GenerationStatus;
  model: string;
  promptVersion: string;
  input: GenerationInput;
  applied: boolean;
  attempts: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** USD estimado. null = preço não configurado (ou ainda não terminou). */
  costUsd: number | null;
  durationMs: number | null;
  errorCode: GenerationErrorCode | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface UserAiUsage {
  generations: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}
