-- Where the transcriber started each run of speech.
--
-- Reported from a real episode: three people's turns ran onto one line,
-- because the transcriber wrote no full stop between them and the only rule
-- for breaking a line was punctuation. The transcriber's own segment
-- boundaries sat at all three joins, and were being thrown away.
--
-- Only the starts, never the segment text. The text is already in `words`,
-- and keeping a second copy would roughly double the largest column in the
-- database to say nothing new — which matters on a 500 MB tier holding
-- about forty-five episodes.
--
-- Relative to the chunk, exactly like the word timings beside it, so the
-- same offset turns both into positions in the episode.
--
-- Nullable: every chunk stored before this column existed has none, and
-- those episodes still have to read. A missing value means "the transcriber
-- told us nothing", and the lines fall back to breaking on punctuation.

alter table "chunk_transcripts"
  add column if not exists "segment_starts_ms" integer[];
