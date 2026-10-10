-- Recognising an episode that has already been uploaded.
--
-- Names are not enough: the same recording arrives as `ep-201.mp3` one day
-- and `Sun Your Balls 201.m4a` the next. A hash of the audio itself is the
-- only thing that identifies it, and re-transcribing a two-hour episode
-- spends roughly a third of a day's free allowance to learn nothing.
--
-- Nullable on purpose. Episodes uploaded before this column existed have no
-- hash, and inventing one would make them look like duplicates of nothing.

alter table "episodes"
  add column if not exists "audio_digest" text;

-- Scoped to the series: two different shows may legitimately share audio,
-- and the question is only ever "do *we* already have this".
create index if not exists "episodes_audio_digest"
  on "episodes" ("series_id", "audio_digest");
