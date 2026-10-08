# ADR 0009 — Default to local inference; zero marginal cost

**Date:** 2026-10-07 · **Status:** ~~accepted~~ **superseded by ADR 0010** · **Amends:** ADR 0004 · **Strengthens:** ADR 0002

> **Superseded the same day.** This ADR solved cost but not the actual requirement. The stakeholder needs the app *hosted* — friends using it without their laptop running — which local inference cannot provide. ADR 0010 moves transcription to Groq's free hosted tier, which is free *and* hosted. Kept because the reasoning about whisper.cpp not requiring Python is still correct and still informs ADR 0002, and because a reversal is worth more on the record than erased.

## Context

ADR 0004 chose to buy transcription from Deepgram at ~\$0.26/audio-hour. That is cheap in absolute terms — a 20-recording library of hour-long meetings costs about \$5 — but it is not free, and it carries four costs beyond the invoice:

1. **A credit card is a prerequisite.** Nobody can clone this repo and run it. Even for the author, the first increment is gated on a vendor signup.
2. **Every recording is a third-party data flow.** Audio of real people, often without their knowledge that a vendor is involved. That is the largest item on the risk register and the first thing any prospective user asks about.
3. **Cost scales with exactly the behaviour we want.** The North Star metric is explored audio hours. Succeeding costs more.
4. **A spend alert, a budget ceiling and a kill switch** all become M0 scope — infrastructure built to defend against our own product working.

The decisive new fact: **whisper.cpp is a C++ binary whose Homebrew dependencies are `ggml`, `llama.cpp` and `sdl2-compat` — not Python.** Going local was assumed to drag in Python, a GPU toolchain and a second test ecosystem. It does not. It is a subprocess that reads a WAV and writes JSON.

And the target hardware is an M1 Pro: 10 CPU cores, a 16-core GPU, Metal 3, 16 GB unified memory. Whisper runs well there.

## Decision

**Local inference is the default. Cloud providers remain available as adapters behind the same ports.**

| Concern | Default | Marginal cost | Alternative, same port |
|---|---|---|---|
| Transcription | `whisper.cpp` + `large-v3-turbo`, Metal-accelerated | \$0 | Deepgram / OpenAI / Groq |
| Database | Postgres 16 in Docker | \$0 | Neon, Supabase |
| Blob storage | filesystem adapter (`BlobStore`) | \$0 | Cloudflare R2 |
| Queue | pg-boss, in the local Postgres | \$0 | — |
| Hosting | `localhost` | \$0 | Vercel + Fly.io |
| Assistant (M5) | Ollama, a small local model | \$0 | `claude-opus-5` |

Audio is converted to 16 kHz mono WAV with `ffmpeg`, then passed to `whisper-cli`. Word-level timing comes from `--output-json-full` plus `--dtw` with the matching alignment-head preset. Model files are downloaded once into `models/`, gitignored, and fetched by `pnpm setup:models`.

**Total marginal cost to run this project: \$0.** Fixed cost: one `brew install` and a model download.

## Why this does not reopen the Python question

ADR 0002 deferred Python on the grounds that the MVP contains no ML we own. That reasoning is unchanged and in fact strengthened: whisper.cpp is a binary we shell out to, exactly like `ffmpeg`. The TypeScript monorepo, the single test runner and the one type system all survive. ADR 0002's stated reversal trigger — *"if privacy requires that audio never leave the machine, local transcription becomes a day-one requirement and this ADR is superseded"* — turns out to have been wrong about the consequence. Local transcription arrived, and ADR 0002 stands.

## The assistant gets cheaper too, and ADR 0007 is why

Counting questions are answered by SQL. The model's only job is compiling natural language into a `Query` object and narrating the result — a structured-extraction task, not a reasoning task. **A small local model is sufficient for that**, because the model is never trusted with a number. The same decision that made the assistant *correct* (ADR 0007) also makes it *free*.

Had we built RAG, this would not be true: stuffing a 50-hour library into context costs roughly \$3.25 per question and needs a frontier model to have any chance of being right. Tool use over aggregates costs ~\$0.02–0.04 on a hosted model, or \$0 on a local one. Correctness and cost pointed the same way.

## Consequences

**Gained**

- The repo runs offline with no account, no key and no card. Clone, `brew install`, `pnpm setup:models`, go.
- Audio never leaves the machine. This closes Q2 as a privacy *win* rather than a trade-off, and dissolves most of the vendor/consent risk — no DPA, no subprocessor to disclose, no vendor-terms review gating M1.
- The cost risks on the register (runaway spend on long files, per-question LLM cost, an open upload endpoint as a billing liability) largely evaporate. Spend metering, budget ceilings and kill switches leave M0 scope entirely.
- Accuracy is not meaningfully sacrificed. `large-v3-turbo` is close to `large-v3` on English and competitive with paid APIs on clean speech.
- Re-transcription becomes free, not just re-analysis. ADR 0005 already made counting free to re-run; now the expensive stage is free too, so improving the model is a background task rather than a budget decision.

**Paid**

- **Slower.** Estimated 10–15× realtime for `large-v3-turbo` on this M1 Pro, so a 60-minute recording takes roughly 4–6 minutes versus under a minute on a cloud API. ⚠️ Estimate — M0 must benchmark it. For a personal archive this is the right trade; it also raises the value of the async queue, so the M1 ordering gets *more* justified, not less.
- **Your laptop is the worker.** Processing competes with other work and spins the fans. Fine at a few recordings a week; not fine at a hundred.
- **Diarisation is the real casualty.** whisper.cpp's `tinydiarize` detects speaker *turns* only, and only with `small.en-tdrz`. Proper speaker separation needs `pyannote` or `sherpa-onnx`. So M3's speaker feature is where Python may genuinely return — narrowly, later, for one capability, with the port already in place. Alternatively M3 uses a cloud adapter for diarisation alone.
- **No deployed URL at M0.** The PM made that an exit criterion, and free hosting tiers cannot run whisper.cpp — it needs real CPU. M0 therefore exits on `localhost` plus a benchmark, and deployment moves to whenever there is a second user. This is the one place the roadmap genuinely regresses, and it is worth it.
- Model files are large (~0.5–1.6 GB) and must not enter git.

**Reversal trigger:** if processing throughput ever blocks real use — more than a handful of hours per day, or a user waiting on a queue — switch the adapter to Deepgram. It is a config change, not a refactor. That reversibility is what ADR 0004's port bought, and it is the reason this decision is cheap to make and cheap to unmake.
