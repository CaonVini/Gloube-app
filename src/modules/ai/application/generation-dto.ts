import type { Generation } from '../domain/generation.js';

/** O input/result (pesados) não saem na API: o roteiro pronto já está na viagem. */
export function toGenerationDTO(g: Generation) {
  return {
    id: g.id, tripId: g.tripId, status: g.status, model: g.model, promptVersion: g.promptVersion, applied: g.applied,
    errorCode: g.errorCode, inputTokens: g.inputTokens, outputTokens: g.outputTokens, costUsd: g.costUsd, durationMs: g.durationMs,
    createdAt: g.createdAt.toISOString(), startedAt: g.startedAt?.toISOString() ?? null, finishedAt: g.finishedAt?.toISOString() ?? null,
  };
}
export type GenerationDTO = ReturnType<typeof toGenerationDTO>;
