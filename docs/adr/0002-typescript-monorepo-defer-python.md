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
- **Reversal trigger:** if privacy requires that audio never leave the machine, local transcription becomes a day-one requirement and this ADR is superseded. That is the one answer that changes the stack, which is why it is an explicit open question for the stakeholder.
