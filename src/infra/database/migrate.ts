import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnv } from '../../config/env.js';
import { createDatabase } from './client.js';

async function run(): Promise<void> {
  const env = loadEnv();
  const conn = createDatabase(env.DATABASE_URL, 1);
  try {
    await migrate(conn.db, { migrationsFolder: './drizzle' });
    console.log('[db] migrations aplicadas com sucesso');
  } finally {
    await conn.close();
  }
}

run().catch((err) => {
  console.error('[db] falha ao aplicar migrations', err);
  process.exit(1);
});
