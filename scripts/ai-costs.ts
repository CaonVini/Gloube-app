/**
 * Relatório de custo da IA direto do banco (views ai_cost_daily / ai_cost_by_user).
 * Uso: npm run ai:costs [-- --days 30]
 */
import 'dotenv/config';
import pg from 'pg';

const days = Number(process.argv[process.argv.indexOf('--days') + 1]) || 30;
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL não definida'); process.exit(1); }

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const daily = await pool.query(
    `select day::text, model, prompt_version, generations, succeeded, failed, input_tokens, output_tokens, cost_usd, avg_duration_ms
     from ai_cost_daily where day >= (now() at time zone 'America/Sao_Paulo')::date - $1::int order by day desc, model`, [days]);
  console.log(`\nCusto por dia (últimos ${days} dias, USD estimado):`);
  console.table(daily.rows);
  const total = await pool.query(`select coalesce(sum(cost_usd),0)::text as total_usd, coalesce(sum(generations),0) as generations from ai_cost_daily where day >= (now() at time zone 'America/Sao_Paulo')::date - $1::int`, [days]);
  console.log('Total do período:', total.rows[0]);
  const users = await pool.query(`select user_id, generations, input_tokens, output_tokens, cost_usd, last_generation_at from ai_cost_by_user order by cost_usd desc limit 20`);
  console.log('\nMaiores consumidores:');
  console.table(users.rows);
} finally {
  await pool.end();
}
