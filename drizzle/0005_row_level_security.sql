-- Row Level Security: o próprio Postgres impede um usuário de enxergar ou alterar dados de outro,
-- mesmo que a aplicação esqueça um `WHERE user_id = ...`.
-- Como funciona: a aplicação abre cada operação numa transação com `SET LOCAL ROLE aurora_app` e
-- `app.user_id = <dono do token>`. `aurora_app` não tem BYPASSRLS e só tem os GRANTs mínimos abaixo.
-- Tabelas de autenticação (users, refresh_tokens, social_identities) NÃO entram: login e cadastro acontecem
-- antes de existir um usuário identificado (consulta por e-mail/token); elas são protegidas pelo código de auth.

-- ============ Papéis ============
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aurora_app') THEN CREATE ROLE "aurora_app" NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aurora_worker') THEN CREATE ROLE "aurora_worker" NOLOGIN NOBYPASSRLS; END IF;
END $$;--> statement-breakpoint
-- O usuário da conexão precisa poder assumir os papéis (SET ROLE)
GRANT "aurora_app" TO CURRENT_USER;--> statement-breakpoint
GRANT "aurora_worker" TO CURRENT_USER;--> statement-breakpoint

-- ============ Privilégios mínimos ============
GRANT USAGE ON SCHEMA public TO "aurora_app", "aurora_worker";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "trips" TO "aurora_app";--> statement-breakpoint   -- sem DELETE: viagens nunca são apagadas
GRANT SELECT, INSERT ON "trip_status_history" TO "aurora_app";--> statement-breakpoint
GRANT USAGE ON SEQUENCE "trip_status_history_id_seq" TO "aurora_app";--> statement-breakpoint
GRANT SELECT, INSERT ON "ai_generations" TO "aurora_app";--> statement-breakpoint
GRANT SELECT ON "trip_summaries", "user_trip_stats", "ai_cost_by_user" TO "aurora_app";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "trips_sync_statuses"(uuid, date) TO "aurora_app";--> statement-breakpoint
-- Worker: só a fila (as viagens são gravadas pelo caminho do próprio dono)
GRANT SELECT, UPDATE ON "ai_generations" TO "aurora_worker";--> statement-breakpoint

-- ============ Dono atual da transação ============
CREATE FUNCTION "app_user_id"() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;--> statement-breakpoint

-- ============ Policies ============
-- Sem `FORCE`: o dono da tabela (migrations, relatório de custo) continua acessando tudo; quem assume aurora_app/aurora_worker é filtrado.
-- Sem app.user_id definido, app_user_id() é NULL e nenhuma linha é visível (fail-closed).
ALTER TABLE "trips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "trips_owner" ON "trips" FOR ALL TO "aurora_app"
  USING ("user_id" = "app_user_id"()) WITH CHECK ("user_id" = "app_user_id"());--> statement-breakpoint

ALTER TABLE "trip_status_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "trip_status_history_owner" ON "trip_status_history" FOR ALL TO "aurora_app"
  USING ("user_id" = "app_user_id"()) WITH CHECK ("user_id" = "app_user_id"());--> statement-breakpoint

ALTER TABLE "ai_generations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_generations_owner" ON "ai_generations" FOR ALL TO "aurora_app"
  USING ("user_id" = "app_user_id"()) WITH CHECK ("user_id" = "app_user_id"());--> statement-breakpoint
CREATE POLICY "ai_generations_worker" ON "ai_generations" FOR ALL TO "aurora_worker"
  USING (true) WITH CHECK (true);
