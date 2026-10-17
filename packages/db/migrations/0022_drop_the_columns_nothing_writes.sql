-- Columns nothing writes, and one that lies.
--
-- Not a space saving — these are a few bytes on small tables. The reason is
-- that an unwritten column is worse than no column: it reads as data.
--
-- `episodes.pipeline_version` is the one that actually cost me something. It
-- is NOT NULL DEFAULT 1 and nothing has ever written it, so every episode
-- reports version 1 while the real version lives on `insights` and is at 6.
-- I read it while checking whether a fix had reached the library, concluded
-- the episodes were on the old pipeline, and started looking for a bug that
-- was not there.
--
-- `episodes.byte_size` is NOT NULL DEFAULT 0 and all 24 rows read 0 — the
-- upload size was never recorded once the browser started cutting chunks.
--
-- `episodes.blob_key` is from before chunking, when an episode was one
-- object. 0 of 24 rows set.
--
-- `episodes.audio_purged_at` was for a retention policy that shipped
-- differently: audio is freed per chunk as it transcribes (ADR 0031) and
-- nothing stamps a time. 0 of 24 rows set. The state is derivable anyway — a
-- `ready` episode has no audio.
--
-- `mentions.segment_id` is referenced nowhere in the code, so every row it
-- ever gets would be null.
alter table "episodes" drop column if exists "pipeline_version";
alter table "episodes" drop column if exists "byte_size";
alter table "episodes" drop column if exists "blob_key";
alter table "episodes" drop column if exists "audio_purged_at";
alter table "mentions" drop column if exists "segment_id";
