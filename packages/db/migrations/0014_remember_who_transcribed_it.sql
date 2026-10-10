-- Which model actually produced a chunk.
--
-- `transcripts.provider_model` was a hard-coded string in the use case, so
-- every episode claimed `whisper-large-v3-turbo` whatever had really run —
-- including the ones transcribed after the switch to the full model
-- (ADR 0024). The one thing that column exists for is tracing a count back
-- to what produced it, and it was quietly wrong.
--
-- Recorded per chunk, because that is where a transcription happens. The
-- analysis step reads it back off the chunks it is stitching.
--
-- Nullable: chunks stored before this column have no record of it, and
-- guessing on their behalf would be making the same mistake again.

alter table "chunk_transcripts"
  add column if not exists "provider_model" text;
