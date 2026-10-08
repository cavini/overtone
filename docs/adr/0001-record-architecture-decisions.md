# ADR 0001 — Record architecture decisions

**Date:** 2026-10-07 · **Status:** accepted

## Context
This project is built evolutionarily: decisions get made early, with partial information, and revisited as we learn. Without a record, the reasoning is lost and we re-litigate settled questions — or worse, silently reverse a decision whose rationale we forgot.

## Decision
Record every significant architectural decision as a numbered ADR in `docs/adr/`. Significant means: hard to reverse, or cross-cutting, or surprising to a newcomer. One file, four sections, short. Superseded ADRs are never deleted — they are marked `superseded by NNNN` and kept, because the history of a decision is as useful as the decision.

## Consequences
- A newcomer reads `docs/adr/` and understands why the code looks like it does.
- Reversals are explicit and dated, not archaeology.
- Trivial choices stay out — an ADR for every library would make the directory worthless.
