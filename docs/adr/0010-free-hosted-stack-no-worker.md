# ADR 0010 — Free hosted stack, and no background worker

**Date:** 2026-10-07 · **Status:** accepted · **Supersedes:** ADR 0009 · **Amends:** ADR 0003 (queue removed), ADR 0004 (adapter changed), ADR 0008 (storage changed)

## Context

Two earlier decisions both missed the actual requirement. ADR 0004 bought transcription from Deepgram, which costs money. ADR 0009 corrected that by running whisper.cpp locally, which is free — but requires the stakeholder's laptop to be running, and requires them to operate a C++ inference toolchain they have no interest in.

The stakeholder's actual words:

> *"I just wanted a fun free app that my friends can use without me having to keep my computer running all the time and having to pay for anything."*

That is three hard constraints, and ADR 0009 satisfied exactly one of them. The product is a **podcast analytics app for a small group of friends**: upload each episode, track running jokes across the series, compare episode to episode, share a stats page.

So the requirement is: **hosted, free, zero-maintenance, no credit card.**

## Decision

| Concern | Service | Free tier (verified 2026-10-07) | Cost |
|---|---|---|---|
| Transcription | **Groq**, `whisper-large-v3-turbo` | 8 hrs audio/day · 20 req/min · 2 000 req/day · **25 MB/file** · word-level timestamps | \$0 |
| Hosting | **Vercel Hobby** | Free forever · 1 M invocations · **300 s max function duration** | \$0 |
| Database | **Supabase Postgres** | 500 MB | \$0 |
| File storage | **Supabase Storage** | 1 GB · signed upload URLs | \$0 |
| Auth | **Supabase Auth**, magic link | 50 000 monthly active users | \$0 |
| Analysis | `wink-nlp`, in-process | — | \$0 |
| Assistant (later) | Groq's free LLMs, or Claude API | — | \$0 |

**No credit card is required by any of them.** Total running cost: \$0/month.

## The consequence that matters most: there is no worker

Groq runs `whisper-large-v3-turbo` at roughly **160× realtime**. A 25-minute episode comes back in about 10 seconds. Vercel Hobby allows 300 seconds per function.

Transcription therefore **fits inside an ordinary web request**, with an order of magnitude of headroom. That deletes, in one stroke:

- the background worker process (`apps/worker`)
- the job queue (`pg-boss`)
- Docker and local Postgres
- job retry/idempotency machinery, stuck-job detection, queue-depth monitoring
- `ffmpeg` and model files on disk
- the entire former M1 increment, "Library & Reliable Pipeline"

This is the single largest simplification available to the project, and it exists only because the chosen transcription service is fast rather than merely cheap. **Speed bought us architecture, not just latency.**

The `JobQueue` port is deleted rather than faked. A port that will never have a second implementation is just indirection.

## What survives, and why that is the point

Every decision that was about *our own domain* rather than about vendors came through all three pivots unchanged:

| ADR | Status | Why it held |
|---|---|---|
| 0002 TypeScript-only | **holds** | Still no ML of our own. Transcription is now an HTTP call, which is even less reason for Python. |
| 0005 Transcription separate from analysis | **holds** | Still two stages storing two artifacts, just two function calls instead of two jobs. Re-running analysis is still free, which still matters constantly. |
| 0006 Topics are user-defined watchlists | **holds, promoted** | A podcast group knows its running bits by name. This went from a mid-roadmap feature to the headline one. |
| 0007 Assistant is tool use, not RAG | **holds** | Counting is still SQL. And since the model only compiles a question into a `Query`, one of Groq's free LLMs is sufficient — the design that made it correct keeps making it free. |
| 0008 Upload contract | **amended, not broken** | Supabase Storage issues signed upload URLs, so `BlobStore.createUploadUrl()` is unchanged. Only the destination moved. |
| 0004 The port itself | **vindicated three times** | Deepgram → whisper.cpp → Groq cost one adapter each. This is the ADR that paid for the whole set. |

Three reversals in one planning session, and the domain model never moved. That is the return on keeping vendors behind ports and keeping `packages/core` free of I/O.

## Constraints we now design against

- **25 MB per file.** Episodes are routinely 60–90 minutes. Mitigation: compress client-side to ~64 kbps mono (fits ~50 minutes in 25 MB), then chunk-and-stitch with timestamp offsetting beyond that. This is real work and gets real acceptance criteria — not an afterthought.
- **8 hours of audio per day, shared across all users.** Fine for friends; it is a hard wall if the app ever gets popular. Surface the remaining daily allowance in the UI rather than failing mysteriously.
- **1 GB total file storage.** Roughly 40 compressed episodes. Needs a retention story earlier than a paid product would.
- **Supabase pauses a free project after 7 idle days.** Mitigated by a daily keep-alive ping (Vercel Cron, one job).
- **No speaker diarisation.** Groq's Whisper does not provide it. "Who talks most" — a signature podcast stat — therefore depends on **multi-track upload**: one file per host, which is how podcasters using Riverside, Zencastr or separate mics already record. Perfect attribution, zero diarisation. Single-file uploads simply have no speaker breakdown, and the UI says so.
- **Vercel Hobby is non-commercial only.** Fine for a hobby project. If this ever earns money it needs a paid plan — noted so it is a known trade, not a surprise.

## Consequences

- The stakeholder's laptop is not involved. Friends visit a URL.
- Nothing to operate: no Docker, no models, no processes, no toolchain. `git push` deploys.
- Auth exists from day one, because friends need accounts — and Supabase Auth makes that nearly free to build, which resolves the long-standing question of whether to defer it.
- The app is dramatically smaller than planned. Fewer moving parts means the TDD loop stays fast and the whole thing is genuinely finishable in spare time.
- **Reversal trigger:** if free-tier limits become the binding constraint — friends hitting the 8-hour daily wall, or storage filling — the answer is a paid Groq/Supabase tier, each a config change. If episodes are consistently too long for 25 MB even compressed, revisit chunk-and-stitch before revisiting the vendor.
