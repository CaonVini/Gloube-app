import { loadEnv } from './config/env.js';
import { createDatabase } from './infra/database/client.js';
import { buildApp } from './app.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const database = createDatabase(env.DATABASE_URL, env.DB_POOL_MAX);
  const app = await buildApp(env, database.db);

  // Graceful shutdown: para de aceitar conexões, termina as em andamento e fecha o pool.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'encerrando...');
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    try {
      await app.close();
      await database.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'erro no shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: env.HOST, port: env.PORT });
}

bootstrap().catch((err) => {
  console.error('Falha ao iniciar a aplicação:', err instanceof Error ? err.message : err);
  process.exit(1);
});
