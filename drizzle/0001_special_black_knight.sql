CREATE TABLE "social_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(20) NOT NULL,
	"provider_user_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address" jsonb;--> statement-breakpoint
ALTER TABLE "social_identities" ADD CONSTRAINT "social_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_identities_provider_uid_unique" ON "social_identities" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "social_identities_user_id_idx" ON "social_identities" USING btree ("user_id");