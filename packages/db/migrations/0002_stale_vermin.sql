CREATE TABLE "allowance" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"hourly_used_ms" bigint DEFAULT 0 NOT NULL,
	"daily_used_ms" bigint DEFAULT 0 NOT NULL,
	"hour_resets_at" timestamp with time zone DEFAULT now() NOT NULL,
	"day_resets_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunk_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"offset_ms" integer NOT NULL,
	"words" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chunk_transcripts_episode_index" UNIQUE("episode_id","index")
);
--> statement-breakpoint
ALTER TABLE "chunk_transcripts" ADD CONSTRAINT "chunk_transcripts_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;