# ADR 0033 — One copy of the word timings

**Date:** 2026-10-17 · **Status:** accepted · **Amends:** ADR 0011 (where the timings live)

## Context

Per-word timings were stored three times: as the transcriber gave them in
`transcripts.raw_provider_payload`, per chunk in `chunk_transcripts.words`,
and per line of transcript in `segments.words`.

The third was read by the transcript reader when it was written. Then
corrections arrived (US-049) and the reader was changed to rebuild lines from
`chunk_transcripts` so a correction could be applied on top of them — which
left `segments.words` written on every analysis and read by nothing. The only
query that touches `segments` is the search, and it selects the times and the
text.

Measured over 23 episodes:

| | on disk | raw | ratio |
|---|---|---|---|
| `segments.words` | 22.2 MB | 24.2 MB | **1.09×** |
| `chunk_transcripts.words` | 3.7 MB | 13.1 MB | 3.51× |

The same data compressing thirty times worse. The cause is row size rather
than the algorithm: every one of 29,610 rows averaged 749 bytes, under the
~2 KB threshold where TOAST begins compressing, so Postgres stored each one
raw. Unread *and* the worst-stored thing in the database — 22 MB of 178, and
31% of everything that was not the fixed dictionaries.

## Decision

**The timings exist once per chunk, in `chunk_transcripts.words`, and are
derived from there wherever else they are needed.**

- `segments` holds the times, the text and the position. No words.
- `transcripts.raw_provider_payload` remains what the transcriber said and
  what re-analysis reads (ADR 0005). It is the source; everything else is
  derived.
- `toSegments` still builds per-word timings in memory — a line with no
  countable words is dropped, which needs them — they are simply not stored.

## Consequences

- The database went from 178 MB to 152 MB, and per-episode cost from 3.1 MB
  to 2.0 MB: room for roughly **185 episodes instead of 127**, against 201
  published.
- Nothing lost. Re-analysis already read the chunks rather than the segments,
  so this column was derived and never source.
- **A column that nothing reads is not free, and not harmless.** It cost 12%
  of the database and was invisible because it was written on every analysis
  and therefore looked alive. The check that found it was asking which
  queries select each column, not which columns look used.
- A future reader of a segment's words has to stitch them from the chunks.
  That is what the transcript reader already does, and what re-analysis does;
  there is no third path to add.
