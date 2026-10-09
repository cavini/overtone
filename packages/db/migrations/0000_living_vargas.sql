CREATE TABLE "episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"recorded_on" date,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"failure_code" text,
	"failure_params" jsonb,
	"pipeline_version" integer DEFAULT 1 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"byte_size" bigint DEFAULT 0 NOT NULL,
	"blob_key" text,
	"share_token" text,
	"audio_purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episodes_share_token_unique" UNIQUE("share_token"),
	CONSTRAINT "episodes_series_number" UNIQUE("series_id","number"),
	CONSTRAINT "episodes_status" CHECK ("episodes"."status" in ('uploaded', 'transcribing', 'analyzing', 'ready', 'failed', 'deleting'))
);
--> statement-breakpoint
CREATE TABLE "heartbeats" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"pinged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"pipeline_version" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"word_tokens" integer NOT NULL,
	"stop_word_tokens" integer NOT NULL,
	"filler_tokens" integer NOT NULL,
	"unique_terms" integer NOT NULL,
	"words_per_minute" real NOT NULL,
	"fillers_per_minute" real NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insights_episode_id_unique" UNIQUE("episode_id")
);
--> statement-breakpoint
CREATE TABLE "lemmas" (
	"form" text PRIMARY KEY NOT NULL,
	"lemma" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"segment_id" uuid,
	"matched_text" text NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"name" text NOT NULL,
	"spec" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transcript_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"text" text NOT NULL,
	"words" jsonb NOT NULL,
	CONSTRAINT "segments_transcript_position" UNIQUE("transcript_id","position")
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series_members" (
	"series_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'host' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_members_series_id_user_id_pk" PRIMARY KEY("series_id","user_id"),
	CONSTRAINT "series_members_role" CHECK ("series_members"."role" in ('owner', 'host'))
);
--> statement-breakpoint
CREATE TABLE "term_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"lemma" text NOT NULL,
	"surface_forms" text[] NOT NULL,
	"count" integer NOT NULL,
	"heuristic" boolean DEFAULT false NOT NULL,
	CONSTRAINT "term_counts_episode_lemma" UNIQUE("episode_id","lemma")
);
--> statement-breakpoint
CREATE TABLE "topic_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"pattern" text NOT NULL,
	"match_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_series_name" UNIQUE("series_id","name")
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_model" text NOT NULL,
	"raw_provider_payload" jsonb NOT NULL,
	"full_text" text NOT NULL,
	"quality_score" smallint,
	"normalization_version" integer DEFAULT 1 NOT NULL,
	"vocabulary_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcripts_episode_id_unique" UNIQUE("episode_id")
);
--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_members" ADD CONSTRAINT "series_members_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_counts" ADD CONSTRAINT "term_counts_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_terms" ADD CONSTRAINT "topic_terms_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "episodes_series_status" ON "episodes" USING btree ("series_id","status");--> statement-breakpoint
CREATE INDEX "lemmas_lemma" ON "lemmas" USING btree ("lemma");--> statement-breakpoint
CREATE INDEX "mentions_episode_topic" ON "mentions" USING btree ("episode_id","topic_id");--> statement-breakpoint
CREATE INDEX "segments_transcript_start" ON "segments" USING btree ("transcript_id","start_ms");--> statement-breakpoint
CREATE INDEX "term_counts_lemma" ON "term_counts" USING btree ("lemma");--> statement-breakpoint
CREATE INDEX "topic_terms_match_key" ON "topic_terms" USING btree ("match_key");