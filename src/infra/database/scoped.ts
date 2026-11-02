import { sql } from 'drizzle-orm';
import type { Database } from './client.js';

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Executa `fn` numa transação "como o usuário" para o Row Level Security do Postgres:
 * - `role aurora_app`: papel SEM bypass de RLS e só com os GRANTs necessários (ver migration 0005);
 * - `app.user_id`: o dono lido pelas policies (`user_id = app_user_id()`).
 * Os dois valores valem só até o fim da transação (`set_config(..., true)`), então não vazam entre
 * requisições que reaproveitam a conexão do pool. Se a aplicação esquecer um `WHERE user_id = ...`,
 * o banco ainda impede ler ou alterar linhas de outra pessoa.
 */
export function asUser<T>(db: Database, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'aurora_app', true), set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/** Para o worker da fila de IA: papel próprio, que só enxerga/atualiza `ai_generations` (nenhuma outra tabela). */
export function asWorker<T>(db: Database, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'aurora_worker', true)`);
    return fn(tx);
  });
}
