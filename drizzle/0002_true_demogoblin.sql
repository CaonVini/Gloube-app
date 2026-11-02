CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'rascunho' NOT NULL,
	"archived_at" timestamp with time zone,
	"origin" varchar(120),
	"climate" varchar(20),
	"reach" varchar(20),
	"companion" varchar(20),
	"experiences" text[] DEFAULT '{}'::text[] NOT NULL,
	"needs" text[] DEFAULT '{}'::text[] NOT NULL,
	"destinations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"liked_places" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"period_mode" varchar(12),
	"period_month" smallint,
	"period_year" smallint,
	"start_date" date,
	"end_date" date,
	"days" integer,
	"budget_brl" numeric(12, 2),
	"itinerary" jsonb,
	"itinerary_revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_status_chk" CHECK ("trips"."status" in ('rascunho','planejada','em_andamento','concluida','cancelada')),
	CONSTRAINT "trips_budget_chk" CHECK ("trips"."budget_brl" is null or "trips"."budget_brl" >= 0),
	CONSTRAINT "trips_days_chk" CHECK ("trips"."days" is null or "trips"."days" >= 1)
);
--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trips_user_updated_idx" ON "trips" USING btree ("user_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "trips_user_active_status_idx" ON "trips" USING btree ("user_id") WHERE status in ('planejada','em_andamento');