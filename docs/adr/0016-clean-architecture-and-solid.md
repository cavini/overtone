# ADR 0016 — Clean Architecture and SOLID, with the dependency rule enforced in CI

**Date:** 2026-10-08 · **Status:** accepted · **Formalises:** the port pattern already used in ADRs 0004, 0008, 0010, 0014

## Context

Much of this is already true by accident of good decisions: `packages/core` has no I/O, external services sit behind ports with fakes, and Zod validates every boundary. The evidence that it works is on the record — the transcription provider changed **three times** (paid API → local binary → hosted free tier) and speaker attribution was **deleted entirely**, and between them those cost one adapter each plus one optional table. The counting engine never moved.

What is missing is rigour and, more importantly, **enforcement**. Architecture that lives in a document decays in a week; the Drizzle row type is simply too convenient to pass straight into a React prop. So this ADR states the layers precisely and then makes a machine check them.

## Decision 1 — Four layers, dependencies pointing only inward

```
   ┌──────────────────────────────────────────────────────┐
   │ 4. Infrastructure   Next.js · Drizzle · Supabase SDK │
   │                     · Groq SDK · React               │
   │  ┌────────────────────────────────────────────────┐  │
   │  │ 3. Adapters   route handlers (controllers)     │  │
   │  │               repositories · gateways          │  │
   │  │               presenters / view models         │  │
   │  │  ┌──────────────────────────────────────────┐  │  │
   │  │  │ 2. Use cases    ProcessEpisode           │  │  │
   │  │  │                 AnalyzeTranscript        │  │  │
   │  │  │                 GetSeriesOverview        │  │  │
   │  │  │                 + the PORT interfaces    │  │  │
   │  │  │  ┌────────────────────────────────────┐  │  │  │
   │  │  │  │ 1. Domain                          │  │  │  │
   │  │  │  │    Episode · Series · Transcript   │  │  │  │
   │  │  │  │    Segment · Term · Topic        │  │  │  │
   │  │  │  │    Mention · Query                 │  │  │  │
   │  │  │  │    pure data + invariants, 0 deps  │  │  │  │
   │  │  │  └────────────────────────────────────┘  │  │  │
   │  │  └──────────────────────────────────────────┘  │  │
   │  └────────────────────────────────────────────────┘  │
   └──────────────────────────────────────────────────────┘
                  source dependencies point ⟶ inward, only
```

| Layer | Lives in | Knows about |
|---|---|---|
| **1 Domain** | `packages/core/domain` | nothing — not even the ports |
| **2 Use cases** | `packages/core/usecases`, `packages/core/ports` | domain + port interfaces |
| **3 Adapters** | `packages/adapters` | use cases + domain + vendor SDKs |
| **4 Infrastructure** | `app/`, config | adapters |

The domain does not know Postgres exists, that there is an HTTP server, or that React is rendering it. `countTerms` would run unchanged in a CLI.

**Folders are named for the domain, not for patterns** — `episodes/`, `series/`, `topics/`, `transcripts/`, `analysis/`, not `services/`, `controllers/`, `utils/`. Someone opening the repo should see what it *does*, not which framework it uses.

## Decision 2 — The dependency rule is machine-enforced, and CI fails on violation

This is the load-bearing half of the ADR. **`dependency-cruiser` runs in CI** with a layered ruleset:

| From | May import |
|---|---|
| `core/domain` | `core/domain` only |
| `core/usecases` | `core/domain`, `core/ports` |
| `core/ports` | `core/domain` |
| `adapters` | `core/**`, vendor SDKs |
| `app` | `adapters`, `core/usecases`, `core/ports` — **never** `core/domain` internals directly |

Banned outright anywhere under `packages/core`: `next`, `react`, `drizzle-orm`, `@supabase/*`, `groq-sdk`, `node:fs`, `node:crypto`. Plus an ESLint rule forbidding `new Date()`, `Date.now()` and `Math.random()` in `core` — those arrive through the `Clock` and `IdGenerator` ports, which is what makes snapshot tests stable.

A violation is a failed build, not a code-review conversation.

## Decision 3 — SOLID, stated as rules specific to this codebase

**S — Single responsibility.** `analyze()` is not a function; it is a pipeline of `tokenise` → `annotate` → `countTerms` → `findMentions` → `summarise`, each independently testable. The test: changing the stop-word policy must not require opening the n-gram matching code. Each use case has exactly one reason to change.

**O — Open/closed.** Two deliberate extension seams, both already proven:
- **Ports.** A new transcription provider is a new adapter and zero use-case edits. Exercised three times.
- **The `Query` object.** A new analytical question *composes a Query*; it does not add a query function. This is precisely why the future assistant is wiring rather than a rewrite (ADR 0007) — it compiles language into the same `Query` the dashboard builds.

**L — Liskov substitution, as a test rather than a platitude.** One shared **contract test suite** runs against *every* implementation of a port — `FakeTranscriptionProvider` and `GroqTranscriptionProvider` both. Same inputs, same contract, same error taxonomy. This matters more here than anywhere else in the codebase: the entire test suite trusts the Fake, so **if the Fake can do something Groq cannot, every test passes for the wrong reason.** The contract suite is what stops the fakes from quietly drifting into fiction.

**I — Interface segregation.** No fat `Database` or `Storage` interface. Repositories are per-aggregate — `EpisodeRepository`, `SeriesRepository`, `TopicRepository`, `TranscriptRepository` — and split by direction where consumers differ, so a use case that only reads depends on `EpisodeReader`, not on something that can also delete. A port's shape is dictated by its *consumer*, never by its implementor's convenience.

**D — Dependency inversion, including the part usually got wrong.** Use cases depend on interfaces, adapters implement them. The detail: **the interface is declared in the inner layer, next to the use case that needs it, and named for what the use case wants** — `core/ports/TranscriptionProvider.ts`, never `adapters/groq/GroqInterface.ts`. The adapter implements an interface it does not own. That inversion of *ownership*, not merely of call direction, is what made three vendor swaps cheap.

## Decision 4 — Boundary DTOs

A use case takes a **request model** and returns a **response model**. It never accepts an HTTP type (`NextRequest`, headers, cookies) and never returns a domain entity or a Drizzle row to a controller. Mapping happens in the adapter.

This exists to prevent one specific, likely decay in *this* app: Drizzle row types are so convenient that without a rule they end up as React props, and then the database schema cannot change without touching the UI. The response model is the firebreak.

## Consequences

- **More files and more mapping.** This is real overhead, and for a hobby project it is more ceremony than the size alone would justify. Two things argue for it anyway: the stakeholder asked for it explicitly and maximally, and in *this* project the pattern has already demonstrably paid — four reversals, zero damage to the engine.
- The analysis engine stays the easiest code in the repo to test, because it is pure functions over plain data with the lemma dictionary passed *in* (ADR 0014) rather than fetched.
- Adding a feature means adding a use case plus a presenter, not editing existing ones — which keeps `main` green and commits small, serving the TDD and small-commit requirements rather than competing with them.
- The enforced ruleset will occasionally be annoying and will occasionally be right when it is annoying. Loosening it requires editing the ruleset in a commit, which makes the exception visible and reviewable.
- **The one pragmatic dial, set to strict:** response DTOs for trivially simple reads are arguably typing for its own sake. Default is strict per the stakeholder's instruction; relaxing it for small read models is a one-line ruleset change if the overhead starts outweighing the benefit.
