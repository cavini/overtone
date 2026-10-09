ALTER TABLE "allowance" ADD COLUMN "remaining_audio_ms" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "allowance" ADD COLUMN "as_of" timestamp with time zone DEFAULT now() NOT NULL;