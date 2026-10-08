# Overtone

Turn a recording into countable, citable facts about what was said.

Upload a meeting, podcast, interview or lecture. Overtone transcribes it and tells you how often a term came up, which topics you track were mentioned and when, who talked and for how long, and how all of that is changing across your library — **with a timestamped quote behind every single number.**

> *Overtone* — in acoustics, the harmonics stacked above a fundamental: the part of a sound you don't consciously hear. In speech, the themes running underneath what was actually said. Both are the product.

---

## The idea

Transcription is a commodity and summarisation is crowded. The gap is **trustworthy counting**: a number you can verify. Every statistic in Overtone drills down to the exact utterances that produced it and plays them back, because a count nobody can check is a count nobody acts on.

That design has a useful side effect. Once per-recording aggregates are stored queryably, a question like *"how many times did we ever discuss hotdogs?"* is one indexed SQL aggregate across the whole library — not a search, not a guess. The AI assistant that answers it in plain English is deliberately **the last thing we build and the cheapest**, because everything it needs gets built first for the dashboard.

## Status

**Planning complete, implementation not started.** The documentation below is the plan of record.

| Increment | Delivers | State |
|---|---|---|
| M0 | Walking skeleton: one file → real transcript → one real statistic, deployed | next |
| M1 | Accounts, durable library, async pipeline that recovers from failure | |
| M2 | Topics, mention counts, drill-down to quotes — the core promise | |
| M3 | Speakers and trends over time | |
| M4 | v1: polish, trust, launchable | |
| M5 | "Ask your library" — the AI assistant, behind a flag | |

## Documentation

**Start here:** [`docs/product/roadmap.md`](docs/product/roadmap.md) — the thesis, the increments, what ships when.

**Product** — owned by the PO and PM roles
| | |
|---|---|
| [`personas.md`](docs/product/personas.md) | Who it's for. MVP targets P1 (Maya, a recurring-meeting owner). |
| [`use-cases.md`](docs/product/use-cases.md) | 28 use cases, tagged MVP / Next / Later |
| [`user-journeys.md`](docs/product/user-journeys.md) | 4 MVP journeys + the future assistant journey |
| [`backlog.md`](docs/product/backlog.md) | 10 epics, 36 stories, 104 Gherkin scenarios — **the source of the test suite** |
| [`glossary-and-domain.md`](docs/product/glossary-and-domain.md) | The domain language, and 12 numbered decisions about what "a word was said" actually means |
| [`definition-of-ready-and-done.md`](docs/product/definition-of-ready-and-done.md) | The quality gates |
| [`metrics.md`](docs/product/metrics.md) | North Star + per-increment measures, and the vanity metrics we refuse |
| [`risks.md`](docs/product/risks.md) | Risk register, with the cheapest experiment that de-risks each |
| [`release-strategy.md`](docs/product/release-strategy.md) | How increments reach users |
| [`open-questions.md`](docs/product/open-questions.md) | Q1–Q12: what still needs deciding, by whom, by when |

**Engineering**
| | |
|---|---|
| [`tech-stack.md`](docs/architecture/tech-stack.md) | What we're building it with, and what we rejected |
| [`system-design.md`](docs/architecture/system-design.md) | Pipeline, data model, API surface, the analysis engine |
| [`testing-strategy.md`](docs/architecture/testing-strategy.md) | TDD in practice: Gherkin → tests, fakes, the four credibility guards |
| [`docs/adr/`](docs/adr/) | Numbered decision records — why the code looks like it does |

## Stack, in one line

TypeScript monorepo — Next.js 15 + Tailwind + shadcn/ui on the front, Postgres (+ pg-boss, full-text search, and later pgvector) as the only stateful service, a Node worker for the pipeline, bought transcription and all other external services behind ports with fakes so the whole suite runs offline. Details and rejected alternatives in [`tech-stack.md`](docs/architecture/tech-stack.md).

## How this gets built

- **Test-driven.** The failing test comes first, and we watch it fail. Acceptance criteria in the backlog *are* the test suite.
- **Evolutionary, never waterfall.** Every increment ships end to end and is independently valuable. If stopping after it would leave a user with nothing, the slice is wrong.
- **Small commits.** One concern each, committed on green, readable as history.
- **Counts come from SQL, never from a language model.** The model phrases; it does not do arithmetic.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CLAUDE.md`](CLAUDE.md).
