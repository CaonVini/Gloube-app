import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  db: Database;
  pool: pg.Pool;
  close(): Promise<void>;
}

export function createDatabase(url: string, poolMax: number): DatabaseConnection {
  const pool = new pg.Pool({
    connectionString: url,
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Mata queries travadas em vez de segurar conexões do pool indefinidamente
    statement_timeout: 10_000,
  });

  // Erros em conexões ociosas não podem derrubar o processo
  pool.on('error', (err) => {
    console.error('[db] erro inesperado em conexão ociosa', err.message);
  });

  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
