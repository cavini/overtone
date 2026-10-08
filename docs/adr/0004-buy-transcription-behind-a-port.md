# ADR 0004 — Buy transcription, hide it behind a port

**Date:** 2026-10-07 · **Status:** accepted; adapter changed twice (ADR 0009, then **ADR 0010** — now Groq's free tier)

> **This is the ADR that paid for all the others.** The provider went Deepgram → local whisper.cpp → Groq in a single planning session. Each reversal cost one adapter and zero changes to the domain model, the tests or the UI. The decision to define the port *before* choosing a provider is the reason the other reversals were cheap.

## Context
Transcription is the product's hardest technical dependency and its central risk: **every statistic we show is only as accurate as the transcript underneath it.** It is also the only paid, slow, non-deterministic step in the pipeline — which makes it poison for a test suite if it is called directly.

Candidates: Deepgram Nova-3 (word-level timestamps + diarisation, ~$0.26/audio-hour est.), OpenAI `whisper-1` (cheap and simple, but no diarisation and a 25 MB cap), AssemblyAI (strong, but bundles topic detection and sentiment — the very layer that is our product), local faster-whisper/WhisperX (free and private, but needs Python and a GPU).

## Decision
Define `TranscriptionProvider` in `packages/core` with three implementations from the start:

| Implementation | Used by |
|---|---|
| `FakeTranscriptionProvider` | every test, including E2E — reads committed fixtures |
| `DeepgramProvider` | dev and production |
| `LocalWhisperProvider` | later, if privacy or volume demands it |

~~Deepgram is the first real adapter~~ — **ADR 0009 inverts this**: `LocalWhisperProvider` (whisper.cpp) is the default, Deepgram an opt-in adapter. The *port* is unchanged, and it is the reason the reversal cost nothing: a different default is a config value, not a refactor. The raw provider response is stored verbatim in `transcripts.raw_provider_payload` and never discarded, whichever adapter produced it.

## Consequences
- The entire test suite runs offline, instantly, deterministically, and for free. This is the single highest-leverage decision in the repo.
- Swapping or A/B-testing providers is an adapter, not a refactor.
- Keeping the raw payload lets us re-derive everything, compare providers on the same audio, and debug a wrong count without paying twice.
- A contract test validates each committed fixture against the provider's Zod schema, so an upstream shape change breaks a one-second test rather than production.
