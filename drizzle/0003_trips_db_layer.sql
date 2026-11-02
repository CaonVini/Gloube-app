-- Camada de banco das viagens: constraints, triggers, function, views e histórico.
-- O banco é a ÚLTIMA barreira: mesmo um bug na aplicação (ou um SQL manual) não consegue
-- reatribuir a dona de uma viagem, pular o fluxo de status, editar viagem encerrada nem gravar lixo.

-- ============ 1. Constraints de integridade ============
ALTER TABLE "trips" ADD CONSTRAINT "trips_climate_chk" CHECK ("climate" IS NULL OR "climate" IN ('frio','calor','tanto-faz'));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_reach_chk" CHECK ("reach" IS NULL OR "reach" IN ('perto','brasil','internacional'));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_companion_chk" CHECK ("companion" IS NULL OR "companion" IN ('casal','amigos','familia','solo'));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_experiences_chk" CHECK ("experiences" <@ ARRAY['praia','montanha','cidade','natureza','neve']::text[]);--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_needs_chk" CHECK ("needs" <@ ARRAY['criancas','idosos','acessibilidade','pets']::text[]);--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_destinations_chk" CHECK (jsonb_typeof("destinations") = 'array' AND jsonb_array_length("destinations") <= 10);--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_liked_places_chk" CHECK (jsonb_typeof("liked_places") = 'array' AND jsonb_array_length("liked_places") <= 500);--> statement-breakpoint
-- Teto de 1 MB no roteiro: protege o tamanho da linha, o TOAST e a banda de leitura
ALTER TABLE "trips" ADD CONSTRAINT "trips_itinerary_chk" CHECK ("itinerary" IS NULL OR (jsonb_typeof("itinerary") = 'object' AND pg_column_size("itinerary") <= 1048576));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_period_chk" CHECK (
  "period_mode" IS NULL
  OR ("period_mode" = 'indefinido' AND "period_month" IS NULL AND "period_year" IS NULL AND "start_date" IS NULL AND "end_date" IS NULL)
  OR ("period_mode" = 'mes' AND "period_month" BETWEEN 1 AND 12 AND "period_year" IS NOT NULL AND "start_date" IS NULL AND "end_date" IS NULL)
  OR ("period_mode" = 'definidas' AND "start_date" IS NOT NULL AND ("end_date" IS NULL OR "end_date" > "start_date"))
);--> statement-breakpoint

-- ============ 2. Trigger de proteção (imutabilidade, fluxo de status, viagem encerrada) ============
CREATE FUNCTION "trips_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" <> OLD."id" OR NEW."user_id" <> OLD."user_id" OR NEW."created_at" <> OLD."created_at" THEN
    RAISE EXCEPTION 'trips: id, user_id e created_at são imutáveis' USING ERRCODE = '42501';
  END IF;

  IF NEW."status" <> OLD."status" AND NOT (
       (OLD."status" = 'rascunho'     AND NEW."status" IN ('planejada','cancelada'))
    OR (OLD."status" = 'planejada'    AND NEW."status" IN ('em_andamento','cancelada'))
    OR (OLD."status" = 'em_andamento' AND NEW."status" IN ('concluida','cancelada'))
  ) THEN
    RAISE EXCEPTION 'trips: transição de status inválida (% -> %)', OLD."status", NEW."status" USING ERRCODE = '23514';
  END IF;

  -- Viagem concluída/cancelada só aceita arquivar/desarquivar
  IF OLD."status" IN ('concluida','cancelada')
     AND (to_jsonb(NEW) - 'archived_at' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'archived_at' - 'updated_at') THEN
    RAISE EXCEPTION 'trips: viagem % não pode ser alterada', OLD."status" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "trips_guard_trg" BEFORE UPDATE ON "trips" FOR EACH ROW EXECUTE FUNCTION "trips_guard"();--> statement-breakpoint

-- ============ 3. Histórico de status (auditoria append-only, preenchido por trigger) ============
CREATE TABLE "trip_status_history" (
  "id" bigserial PRIMARY KEY,
  "trip_id" uuid NOT NULL REFERENCES "trips"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL,
  "from_status" varchar(20),
  "to_status" varchar(20) NOT NULL,
  "changed_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "trip_status_history_trip_idx" ON "trip_status_history" ("trip_id", "changed_at");--> statement-breakpoint
CREATE FUNCTION "trips_log_status"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "trip_status_history"("trip_id","user_id","from_status","to_status") VALUES (NEW."id", NEW."user_id", NULL, NEW."status");
  ELSIF NEW."status" <> OLD."status" THEN
    INSERT INTO "trip_status_history"("trip_id","user_id","from_status","to_status") VALUES (NEW."id", NEW."user_id", OLD."status", NEW."status");
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "trips_log_status_trg" AFTER INSERT OR UPDATE OF "status" ON "trips" FOR EACH ROW EXECUTE FUNCTION "trips_log_status"();--> statement-breakpoint
-- Histórico não se edita (remoção só acontece em cascata, quando a viagem/usuário é apagado)
CREATE FUNCTION "trip_status_history_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'trip_status_history é append-only' USING ERRCODE = '42501';
END $$;--> statement-breakpoint
CREATE TRIGGER "trip_status_history_immutable_trg" BEFORE UPDATE ON "trip_status_history" FOR EACH ROW EXECUTE FUNCTION "trip_status_history_immutable"();--> statement-breakpoint

-- ============ 4. Stored function: avanço automático de status em UMA ida ao banco ============
CREATE FUNCTION "trips_sync_statuses"(p_user uuid, p_today date) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n1 integer; n2 integer;
BEGIN
  UPDATE "trips" SET "status" = 'em_andamento', "updated_at" = date_trunc('milliseconds', clock_timestamp())
   WHERE "user_id" = p_user AND "status" = 'planejada' AND "period_mode" = 'definidas' AND "start_date" <= p_today;
  GET DIAGNOSTICS n1 = ROW_COUNT;
  -- Fim da viagem: volta, ou ida + dias (ou só a ida, sem duração)
  UPDATE "trips" SET "status" = 'concluida', "updated_at" = date_trunc('milliseconds', clock_timestamp())
   WHERE "user_id" = p_user AND "status" = 'em_andamento' AND "period_mode" = 'definidas'
     AND COALESCE("end_date", "start_date" + COALESCE("days", 0)) < p_today;
  GET DIAGNOSTICS n2 = ROW_COUNT;
  RETURN n1 + n2;
END $$;--> statement-breakpoint

-- ============ 5. Views ============
-- Listagem: tudo MENOS o roteiro e os lugares curtidos (jsonb pesado), sem custo de TOAST na lista.
CREATE VIEW "trip_summaries" WITH (security_invoker = true) AS
SELECT "id","user_id","status","archived_at","origin","companion","period_mode","period_month","period_year",
       "start_date","end_date","days","budget_brl","destinations",
       ("itinerary" IS NOT NULL) AS "has_itinerary","created_at","updated_at"
  FROM "trips";--> statement-breakpoint
-- Números do perfil ("Viagens realizadas / Países visitados / Lugares visitados"): viagem concluída conta como realizada.
CREATE VIEW "user_trip_stats" WITH (security_invoker = true) AS
SELECT t."user_id",
       count(*)::int AS "trips_completed",
       (SELECT count(DISTINCT d->>'country') FROM "trips" t2, jsonb_array_elements(t2."destinations") d
         WHERE t2."user_id" = t."user_id" AND t2."status" = 'concluida' AND COALESCE(d->>'country','') <> '')::int AS "countries_visited",
       (SELECT count(DISTINCT p) FROM "trips" t3,
               LATERAL jsonb_path_query(COALESCE(t3."itinerary", '{}'::jsonb), '$.days[*].items[*].placeRef') p
         WHERE t3."user_id" = t."user_id" AND t3."status" = 'concluida' AND p <> 'null'::jsonb)::int AS "places_visited"
  FROM "trips" t
 WHERE t."status" = 'concluida'
 GROUP BY t."user_id";
