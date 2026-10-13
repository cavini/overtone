-- Where the chunk boundaries actually ended up, once moved off the clock.
--
-- The plan comes from `planChunks(durationMs)`, which is pure arithmetic and
-- was recomputed everywhere it was needed — six call sites, all agreeing
-- because they all did the same sum. That works exactly as long as the cuts
-- land where the sum says.
--
-- They should not. A boundary at an arbitrary instant falls mid-word most of
-- the time, and a transcriber handed half a word returns a whole one it can
-- pronounce, so the counts gain a word nobody said at every seam (US-040,
-- "Splitting never cuts a word in half"). The browser now moves each seam to
-- the nearest gap, which means the boundaries are no longer derivable from
-- the duration and have to be written down.
--
-- Null means "the plan stands". Every episode from before this migration
-- reads exactly as it did, and an episode uploaded by a browser that fails
-- to report its boundaries falls back to the arithmetic rather than to
-- nothing. The one thing that must never happen is a mixture — some chunks
-- offset by the plan and some by the settled list — which is why this is the
-- whole array or none of it, written once before any chunk is transcribed.
alter table "episodes"
  add column if not exists "chunk_starts_ms" bigint[];

comment on column "episodes"."chunk_starts_ms" is
  'Settled chunk start offsets in ms, ascending, first always 0. Null means the planned boundaries from planChunks(duration_ms) stand.';
