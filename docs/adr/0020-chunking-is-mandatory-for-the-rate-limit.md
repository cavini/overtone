# ADR 0020 — Chunking comes back, for the rate limit rather than the file size

**Date:** 2026-10-09 · **Status:** accepted · **Supersedes:** ADR 0018 · **Reinstates:** ADR 0011 decision 1 · **Evidence:** `docs/experiments/0002-full-episode-attempt.md`

## Context

ADR 0011 split every episode into chunks. ADR 0018 deleted that, on the grounds that the 25 MB file cap was not actually binding: at 16 kHz mono Opus a two-hour episode fits in one upload, so the splitter, the stitching and a whole class of silent timestamp bugs could go.

**The file-size reasoning was correct and the conclusion was wrong.**

Measured against a real episode — 2 h 06 m 31 s, the show's ordinary length:

| | |
|---|---|
| Encoded size | **22.58 MB** — comfortably inside the 25 MB cap, exactly as ADR 0018 predicted |
| Duration | **7 591 audio-seconds** |
| Free-tier allowance | **7 200 audio-seconds per hour** |
| Result | `HTTP 413 · seconds of audio per hour (ASPH): Limit 7200, Requested 7591` |

The request was refused for its **duration**, not its size. A single episode of this show is 391 seconds longer than the entire hourly allowance, so no amount of better encoding will ever get it through as one request.

It is worse than a per-request ceiling. The *total* also exceeds one hour's budget, so one episode cannot be transcribed inside a single hour at all — it has to span two hourly windows.

ADR 0011 was right. It was right for a reason none of us had identified: the limit that binds is time, not bytes.

## Decision

**Chunking is mandatory.** The browser splits each episode on silence boundaries and the server transcribes the pieces, as ADR 0011 described — with one addition ADR 0011 did not anticipate.

**The chunks must be paced, not fired in parallel.** ADR 0011's whole argument for chunking was wall-clock: run the pieces concurrently and finish in the time of the slowest. That is now impossible. The hourly allowance is consumed by audio *duration*, so sending six 21-minute chunks at once spends 7 591 seconds against a 7 200-second budget just as surely as sending one file did.

So transcription becomes a **paced queue** rather than a fan-out:

- No single chunk may exceed the hourly allowance. A 20–25 minute chunk is far inside it.
- Chunks are sent while the hour's remaining allowance covers them, and wait when it does not.
- An episode longer than 7 200 seconds — which is most of them, for this show — necessarily spans two hourly windows. **Processing one episode takes over an hour of wall-clock on the free tier.** That is a product fact, not a performance bug.
- Progress has to be visible and honest: "part 4 of 6, next at 15:20" is the truth, and a spinner implying imminent completion is a lie.

## What this costs

The thing ADR 0018 was most pleased to have deleted comes back: **timestamp stitching, which fails silently.** An off-by-one in a chunk offset leaves counts looking plausible while pointing at the wrong moment in the audio. The property tests ADR 0011 specified for it are not optional.

Domain decision D8 also matters again: chunk boundaries must be invisible to phrase matching, so a running joke split across a join still counts. Our own plumbing must never change a number.

And the no-background-worker decision (ADR 0010) is strained. A paced queue spanning hours is exactly what a worker exists for. It survives for now because the pacing can live in the episode's own status and a scheduled poke rather than a long-running process — but if that becomes contorted, a worker is the honest answer and this is the ADR that predicted it.

## Consequences

- **A weekly show still works comfortably**, provided nobody expects an episode ready in five minutes. At 20-minute chunks an episode is **7 pieces**, six of which fit in one hourly window, so the seventh waits — roughly **1.1 hours of wall-clock** per episode, almost all of it spent waiting on the allowance rather than on transcription.
- Daily ceiling: 28 800 audio-seconds, so **three of this show's episodes per day**, not four. Backfilling the 219-episode archive is **462 audio-hours — about 58 days** of continuous processing, which settles the back-catalogue question on arithmetic alone.
- The 25 MB file cap stops being a design constraint. It is checked, and the encoder keeps us well inside it, but it decides nothing.
- **Reversal trigger:** Groq's Dev tier raises the allowance. If this show's episodes ever need to be ready promptly, that is the thing to buy — not a different provider, and not a cleverer encoder. The pacing stays either way, because an allowance that is merely larger is still finite.

## The lesson worth keeping

ADR 0018 reasoned carefully from the documented limit it knew about and deleted working machinery on the strength of it. The limit that mattered was in the same rate-card table and was never checked against a real episode's duration.

Three planning rounds, a risk register and a documented constraint all failed to catch it. One upload of one real file caught it in two seconds.
