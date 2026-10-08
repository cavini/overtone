# ADR 0005 — Transcription and analysis are separate, independently re-runnable stages

**Date:** 2026-10-07 · **Status:** accepted

## Context
The obvious pipeline is one job: audio in, statistics out. But the two halves could not be less alike. Transcription is slow, paid, non-deterministic and externally owned. Analysis is fast, free, deterministic and entirely ours — and it is the part we will change constantly as we improve lemmatisation, stop-word policy and n-gram matching.

## Decision
Two stages, two jobs, two stored results. `transcribe` persists the transcript (plus the raw payload); `analyse` reads the stored transcript and writes insights, term counts and mentions. Both are idempotent, keyed on recording id + `pipeline_version`. `POST /api/recordings/:id/reprocess` re-runs analysis alone.

## Consequences
- Improving the analyser costs nothing. We re-derive every statistic in the library at zero marginal cost — which during MVP development will happen many times a week.
- A failure in one stage does not discard the other's work. A failed analysis never means re-paying for transcription.
- At-least-once queue delivery is safe: re-running a completed stage at the same version is a no-op.
- `pipeline_version` must be bumped whenever analysis output changes, or stale counts persist. This is a discipline, so it gets a test: a fixture's expected counts are pinned to a version.
- Cost: more tables, more states, more machinery than one job. Paid back the first time we fix a tokeniser bug.
