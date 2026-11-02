-- Fila de geração de roteiro por IA + rastreio de custo.
-- Uma linha por geração: serve ao mesmo tempo de FILA (status queued/running) e de LIVRO-CAIXA de custo.

CREATE TABLE "ai_generations" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "trip_id" uuid NOT NULL REFERENCES "trips"("id") ON DELETE CASCADE,
  "status" varchar(12) NOT NULL DEFAULT 'queued',
  "model" varchar(80) NOT NULL,
  "prompt_version" varchar(40) NOT NULL,
  -- Foto do que foi enviado à IA (prévia do app + dados da viagem): permite auditar e reproduzir
  "input" jsonb NOT NULL,
  "result" jsonb,
  "applied" boolean NOT NULL DEFAULT false,
  "attempts" smallint NOT NULL DEFAULT 0,
  "input_tokens" integer,
  "output_tokens" integer,
  -- Custo estimado em USD (a OpenAI cobra em dólar): tokens x preço configurado por 1M de tokens
  "cost_usd" numeric(12,6),
  "duration_ms" integer,
  "error_code" varchar(40),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  CONSTRAINT "ai_generations_status_chk" CHECK ("status" IN ('queued','running','succeeded','failed')),
  CONSTRAINT "ai_generations_tokens_chk" CHECK (("input_tokens" IS NULL OR "input_tokens" >= 0) AND ("output_tokens" IS NULL OR "output_tokens" >= 0)),
  CONSTRAINT "ai_generations_cost_chk" CHECK ("cost_usd" IS NULL OR "cost_usd" >= 0),
  CONSTRAINT "ai_generations_input_chk" CHECK (pg_column_size("input") <= 262144),
  CONSTRAINT "ai_generations_result_chk" CHECK ("result" IS NULL OR pg_column_size("result") <= 1048576)
);--> statement-breakpoint

-- O worker só olha o que está na fila/rodando (índice parcial minúsculo)
CREATE INDEX "ai_generations_queue_idx" ON "ai_generations" ("created_at") WHERE "status" IN ('queued','running');--> statement-breakpoint
CREATE INDEX "ai_generations_user_idx" ON "ai_generations" ("user_id", "created_at" DESC);--> statement-breakpoint
CREATE INDEX "ai_generations_trip_idx" ON "ai_generations" ("trip_id", "created_at" DESC);--> statement-breakpoint
-- No máximo UMA geração ativa por viagem: garantido pelo banco, mesmo com duas requisições simultâneas
CREATE UNIQUE INDEX "ai_generations_one_active_per_trip_idx" ON "ai_generations" ("trip_id") WHERE "status" IN ('queued','running');--> statement-breakpoint

CREATE FUNCTION "ai_generations_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" <> OLD."id" OR NEW."user_id" <> OLD."user_id" OR NEW."trip_id" <> OLD."trip_id"
     OR NEW."created_at" <> OLD."created_at" OR NEW."model" <> OLD."model"
     OR NEW."prompt_version" <> OLD."prompt_version" OR NEW."input" IS DISTINCT FROM OLD."input" THEN
    RAISE EXCEPTION 'ai_generations: id, dono, viagem, modelo, prompt e entrada são imutáveis' USING ERRCODE = '42501';
  END IF;
  -- Registro de custo encerrado é histórico: não se reescreve
  IF OLD."status" IN ('succeeded','failed') THEN
    RAISE EXCEPTION 'ai_generations: geração % é histórica e não pode ser alterada', OLD."status" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "ai_generations_guard_trg" BEFORE UPDATE ON "ai_generations" FOR EACH ROW EXECUTE FUNCTION "ai_generations_guard"();--> statement-breakpoint

-- ============ Views de custo ============
CREATE VIEW "ai_cost_daily" WITH (security_invoker = true) AS
SELECT
  (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
  model,
  prompt_version,
  count(*)::int AS generations,
  count(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
  count(*) FILTER (WHERE status = 'failed')::int AS failed,
  coalesce(sum(input_tokens), 0)::bigint AS input_tokens,
  coalesce(sum(output_tokens), 0)::bigint AS output_tokens,
  coalesce(sum(cost_usd), 0)::numeric(14,6) AS cost_usd,
  coalesce(avg(duration_ms) FILTER (WHERE status = 'succeeded'), 0)::int AS avg_duration_ms
FROM ai_generations
GROUP BY 1, 2, 3;--> statement-breakpoint

CREATE VIEW "ai_cost_by_user" WITH (security_invoker = true) AS
SELECT
  user_id,
  count(*)::int AS generations,
  coalesce(sum(input_tokens), 0)::bigint AS input_tokens,
  coalesce(sum(output_tokens), 0)::bigint AS output_tokens,
  coalesce(sum(cost_usd), 0)::numeric(14,6) AS cost_usd,
  max(created_at) AS last_generation_at
FROM ai_generations
GROUP BY user_id;
