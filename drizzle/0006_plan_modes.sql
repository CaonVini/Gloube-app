-- Dois modos do Planeje + reações aos cards (curtir/não curtir) + orçamento "sem limite" como resposta explícita.
ALTER TABLE "trips" ADD COLUMN "disliked_places" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "plan_mode" varchar(20);--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "budget_unlimited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_plan_mode_chk" CHECK ("plan_mode" IS NULL OR "plan_mode" IN ('destino_definido','com_ajuda'));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_disliked_places_chk" CHECK (jsonb_typeof("disliked_places") = 'array' AND jsonb_array_length("disliked_places") <= 500);--> statement-breakpoint
-- "Sem limite" e um valor de orçamento são excludentes
ALTER TABLE "trips" ADD CONSTRAINT "trips_budget_unlimited_chk" CHECK (NOT ("budget_unlimited" AND "budget_brl" IS NOT NULL));
