# ADR 0002 — One TypeScript monorepo; defer Python until local transcription

**Date:** 2026-10-07 · **Status:** accepted

## Context
The product processes audio, which points at Python (Whisper, pyannote, spaCy). The product is also a polished web app with charts, which points at TypeScript. One engineer is building it.

The decisive observation: **the MVP contains no machine learning that we own.** Transcription is bought from an API. The analysis — tokenise, lemmatise, remove stop words, count terms, match n-gram watchlists — is deterministic text processing, and `wink-nlp` does all of it in-process in JavaScript with no native dependencies.

## Decision
One pnpm/Turborepo monorepo, TypeScript end to end. No Python in the MVP. When local transcription becomes worth its cost, it arrives as a sidecar service behind the existing `TranscriptionProvider` port.

## Consequences
- One language, one test runner, one type system from DB row to chart axis. Types cross every boundary.
- A whole class of problems — IPC, serialisation drift, two CI setups, two dependency managers — does not exist yet.
- We give up the Python ML ecosystem for now. Accepted, because we are not yet using it.
- ~~**Reversal trigger:** if privacy requires that audio never leave the machine, local transcription becomes a day-one requirement and this ADR is superseded.~~ **This trigger fired, and the prediction was wrong** (see ADR 0009). Local transcription arrived on day one, and it did *not* require Python: `whisper.cpp` is a C++ binary we shell out to, exactly like `ffmpeg`. Its Homebrew dependencies are `ggml`, `llama.cpp` and `sdl2-compat`. This ADR stands, strengthened.
- ~~The real remaining trigger is narrower: **speaker diarisation**.~~ **That trigger is also gone (ADR 0010).** Speaker attribution now comes from *multi-track upload* — one audio file per host, which is how podcasters already record — giving exact attribution with no model at all. `pyannote` is not merely deferred; it is unnecessary, and multi-track is more accurate than it anyway.
- **Python is now fully out of scope.** Transcription is an HTTP call to Groq. There is no remaining capability in the plan that wants it.
