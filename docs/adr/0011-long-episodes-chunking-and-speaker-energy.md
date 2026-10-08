# ADR 0011 — Two-hour episodes: chunked upload, and speakers from track energy

**Date:** 2026-10-07 · **Status:** accepted · **Amends:** ADR 0008 (upload flow), ADR 0010 (the multi-track recommendation was wrong)

## Context

The plan assumed short recordings. The stakeholder has since said their episodes run **1 hour 40 minutes to 2 hours**, routinely. That is not an edge case to degrade gracefully on — it is the only case.

Three limits now bind at once:

| Limit | Value | A 2-hour episode |
|---|---|---|
| Groq file size (free) | 25 MB | 2 h of 128 kbps MP3 is ~115 MB — **4.6× over** |
| Groq audio-seconds/hour | 7 200 | 2 h = 7 200 s — **exactly the whole hourly allowance** |
| Groq audio-seconds/day | 28 800 | **four episodes per day, maximum** |
| Vercel function duration | 300 s | transcription alone is 45–180 s — uncomfortably close |

The size problem has an easy answer. Whisper downsamples everything to 16 kHz mono anyway, so encoding above that is wasted bytes. At 16 kHz mono **Opus** — which Groq accepts inside an `ogg` or `webm` container — a 2-hour episode at ~24 kbps is about **21 MB**, under the cap with margin. Opus at 24 kbps is transparent for speech; this costs essentially no accuracy.

So a 2-hour episode *could* go as a single file. We are not going to do that.

## Decision 1 — Chunk in the browser, transcribe in parallel, stitch the timestamps

The browser decodes the episode, splits it into **~20–25 minute pieces on silence boundaries**, encodes each to 16 kHz mono Opus, and uploads each to Storage. The server fires one Groq request per chunk **concurrently**, then offsets each chunk's word timestamps by that chunk's start and concatenates.

Why chunk when one file would fit:

- **Wall-clock.** Four chunks in parallel finish in roughly the time of the slowest one — tens of seconds instead of one serial 45–180 s request. This is what keeps the whole pipeline inside Vercel's 300 s and keeps the no-worker architecture of ADR 0010 alive. Without chunking, a slow 2-hour request could exceed the function limit and we would be forced back into building a queue.
- **Partial retry.** One chunk failing costs one chunk, not two hours of allowance against a daily cap of four episodes.
- **The size cap stops mattering.** Each chunk is ~5 MB. We are nowhere near 25 MB, so the limit never has to be reasoned about again — including if Groq changes it.
- **Headroom for longer.** 2.5- and 3-hour episodes need no new mechanism.

Splitting **on silence** rather than on a fixed clock is the part that matters for correctness: a cut through the middle of a word produces two garbage fragments and corrupts the counts at every join.

**This is the highest-risk code in the project.** An off-by-one in a chunk offset does not crash — it silently points every count after the join at the wrong moment in the audio, which is precisely the failure this product exists to avoid. It gets property tests asserting that a chunked transcript's word timings match a single-pass transcript of the same audio, within tolerance.

Groq also accepts a **URL** instead of an upload, and we have signed Supabase Storage URLs. Worth testing at M0: if Groq fetches the audio itself, the function never moves 21 MB and gets measurably faster. Cheap experiment, nice win, not load-bearing.

## Decision 2 — Speaker attribution from track energy, not per-track transcription

**ADR 0010 recommended transcribing one file per host. That was wrong, for two independent reasons.**

1. **Mic bleed double-counts.** Every host's microphone picks up the others faintly. Whisper is good enough to transcribe that bleed, so the same sentence appears in two or three transcripts. Concatenating them inflates every count — and for a product whose single promise is an accurate count, that is the worst possible bug. Deduplicating by timestamp overlap is fiddly, approximate, and would itself need to be trusted.
2. **It cannot fit the rate limit.** Three hosts × 2 hours = **6 audio-hours for one episode**, against an allowance of 2 audio-hours per hour. A single episode would take three hours of wall-clock and consume 75% of the daily cap.

The corrected design:

- **Transcribe the mixed/master file once.** That is the authoritative word list — complete, with no duplicates, for one episode's worth of allowance.
- **Use each host's track for audio energy only.** Compute a per-track RMS envelope (Web Audio API, in the browser, no model, no API call). For each word in the master transcript, attribute it to whichever host's track is loudest across that word's time span.
- No per-host tracks supplied? The episode has **no speaker breakdown**, and the UI says so plainly rather than guessing.

This is cheaper (one transcription instead of N), exact rather than statistical, free, and immune to the bleed problem — bleed is *why* it works, since the host actually speaking is always loudest on their own track. It is also strictly better than the paid alternative: statistical diarisation costs money and is confidently wrong on crosstalk, which is most of what a podcast is.

Per-host tracks are therefore uploaded **for attribution, not for transcription.** They can also be uploaded at very low bitrate, since only the energy envelope is needed — or reduced to an envelope in the browser and never uploaded at all.

## Decision 3 — Store word timings as compact JSONB, not one row per token

A 2-hour episode is roughly 18–20 k words. One row per token is ~20 k rows and ~4–5 MB per episode with index overhead, which exhausts the 500 MB free database at around 110 episodes.

Instead: `utterances.words` holds a compact JSONB array of `[surface, lemma, startMs, endMs, class]`. Counting reads the materialised `term_counts` table (a few thousand small rows per episode); playback and drill-down read the JSONB for the handful of utterances actually being displayed. Roughly a quarter of the storage, and far fewer rows.

The per-token table is deleted from the design. `term_counts` and `mentions` remain real tables because they are what every aggregate query touches.

## Consequences

- **A weekly show is comfortable.** One 2-hour episode per hour, four per day, is far more than a weekly release needs.
- **Back-catalogue backfill is slow and must be honest about it.** 50 old episodes at 2 hours each is 100 audio-hours — about **two weeks** at the free daily cap. The UI must show remaining allowance and let a backfill run across days rather than failing opaquely.
- **Storage is the real ceiling.** At ~21 MB per episode, 1 GB of free Storage is about **45 episodes**. That arrives well before the database fills, so a retention story (drop the audio, keep the transcript and counts — already modelled as domain decision D12) is needed earlier than a paid product would need it.
- Chunking, silence detection and in-browser Opus encoding are real work — days, not hours — and they land in the first increment because there is no version of this product that works without them.
- The no-worker architecture survives, but **only because of chunking.** That is the load-bearing reason, not an optimisation.
- **Reversal trigger:** if parallel chunks still cannot finish inside 300 s, the answer is Vercel's background functions or a polled status row — not a full queue. Measure before building either.
