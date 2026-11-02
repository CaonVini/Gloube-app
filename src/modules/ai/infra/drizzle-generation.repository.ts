import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../../infra/database/client.js';
import { asUser, asWorker } from '../../../infra/database/scoped.js';
import { aiCostByUser, aiGenerations, type AiGenerationRow } from '../../../infra/database/schema/index.js';
import type { Generation, GenerationErrorCode, GenerationInput, UserAiUsage } from '../domain/generation.js';
import type { CompleteData, FailData, GenerationRepository } from '../application/ports/generation.repository.js';

const toDomain = (r: AiGenerationRow): Generation => ({
  id: r.id, userId: r.userId, tripId: r.tripId, status: r.status as Generation['status'], model: r.model,
  promptVersion: r.promptVersion, input: r.input as GenerationInput, applied: r.applied, attempts: r.attempts,
  inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd === null ? null : Number(r.costUsd),
  durationMs: r.durationMs, errorCode: r.errorCode as GenerationErrorCode | null,
  createdAt: r.createdAt, startedAt: r.startedAt, finishedAt: r.finishedAt,
});

export class DrizzleGenerationRepository implements GenerationRepository {
  constructor(private readonly db: Database) {}

  async enqueue(g: Generation): Promise<boolean> {
    return asUser(this.db, g.userId, async (db) => {
      const rows = await db.insert(aiGenerations).values({
        id: g.id, userId: g.userId, tripId: g.tripId, status: 'queued', model: g.model,
        promptVersion: g.promptVersion, input: g.input, createdAt: g.createdAt,
      }).onConflictDoNothing().returning({ id: aiGenerations.id });
      return rows.length > 0;
    });
  }

  async countSince(userId: string, since: Date): Promise<number> {
    return asUser(this.db, userId, async (db) => {
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(aiGenerations)
        .where(and(eq(aiGenerations.userId, userId), gte(aiGenerations.createdAt, since)));
      return r?.n ?? 0;
    });
  }

  async claimNext(maxAttempts: number, staleMs: number): Promise<Generation | null> {
    return asWorker(this.db, async (db) => {
      // Presas em `running` sem tentativas sobrando: encerra como falha (e libera a viagem)
      await db.execute(sql`
        UPDATE ai_generations SET status = 'failed', error_code = 'worker_timeout', finished_at = now()
        WHERE status = 'running' AND attempts >= ${maxAttempts} AND started_at < now() - (${staleMs} * interval '1 millisecond')`);
      const res = await db.execute(sql`
        UPDATE ai_generations SET status = 'running', attempts = attempts + 1, started_at = now()
        WHERE id = (
          SELECT id FROM ai_generations
          WHERE status = 'queued' OR (status = 'running' AND started_at < now() - (${staleMs} * interval '1 millisecond') AND attempts < ${maxAttempts})
          ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING *`);
      const row = res.rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      // Mesmos campos, mas em snake_case (resultado cru do SQL)
      const [typed] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, row.id as string));
      return typed ? toDomain(typed) : null;
    });
  }

  async complete(id: string, d: CompleteData): Promise<void> {
    return asWorker(this.db, async (db) => {
      await db.update(aiGenerations).set({
        status: 'succeeded', result: d.result, applied: d.applied, inputTokens: d.inputTokens, outputTokens: d.outputTokens,
        costUsd: d.costUsd === null ? null : d.costUsd.toFixed(6), durationMs: d.durationMs, finishedAt: new Date(), errorCode: null,
      }).where(and(eq(aiGenerations.id, id), eq(aiGenerations.status, 'running')));
    });
  }

  async fail(id: string, d: FailData): Promise<void> {
    return asWorker(this.db, async (db) => {
      await db.update(aiGenerations).set({
        status: 'failed', errorCode: d.errorCode, inputTokens: d.inputTokens ?? null, outputTokens: d.outputTokens ?? null,
        costUsd: d.costUsd == null ? null : d.costUsd.toFixed(6), durationMs: d.durationMs, finishedAt: new Date(),
      }).where(and(eq(aiGenerations.id, id), inArray(aiGenerations.status, ['running', 'queued'])));
    });
  }

  async requeue(id: string): Promise<void> {
    return asWorker(this.db, async (db) => {
      await db.update(aiGenerations).set({ status: 'queued' }).where(and(eq(aiGenerations.id, id), eq(aiGenerations.status, 'running')));
    });
  }

  async findById(id: string, userId: string): Promise<Generation | null> {
    return asUser(this.db, userId, async (db) => {
      const [r] = await db.select().from(aiGenerations).where(and(eq(aiGenerations.id, id), eq(aiGenerations.userId, userId))).limit(1);
      return r ? toDomain(r) : null;
    });
  }

  async listForTrip(tripId: string, userId: string, limit: number): Promise<Generation[]> {
    return asUser(this.db, userId, async (db) => {
      const rows = await db.select().from(aiGenerations)
        .where(and(eq(aiGenerations.tripId, tripId), eq(aiGenerations.userId, userId)))
        .orderBy(desc(aiGenerations.createdAt)).limit(limit);
      return rows.map(toDomain);
    });
  }

  async usageForUser(userId: string): Promise<UserAiUsage> {
    return asUser(this.db, userId, async (db) => {
      const [r] = await db.select().from(aiCostByUser).where(eq(aiCostByUser.userId, userId));
      return r
        ? { generations: r.generations, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: Number(r.costUsd) }
        : { generations: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    });
  }
}
