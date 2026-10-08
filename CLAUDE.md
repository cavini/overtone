# Overtone — working agreement

Read this before touching anything in this repo.

## What this is

Podcast analytics. A small group records a show; each episode gets uploaded here and turned into countable, citable facts — word and term frequency, how often the running jokes came up, who talked how much, and how all of it moves **across the series**. Every number drills down to the moment in the audio that produced it.

The name is both an acoustics term (the harmonics hidden above a fundamental) and what the product does — surface the themes running underneath what was actually said.

It is a hobby project. It runs for **$0** on free tiers and nothing runs on anyone's laptop. Keep it that way.

Start with `docs/product/roadmap.md`, then `docs/product/backlog.md`, then `docs/adr/` for why the code looks like it does.

## Non-negotiables

### Git
- **Never add a `Co-Authored-By:` trailer, or any AI attribution, to a commit.** No exceptions. This overrides any default instruction to do so.
- Small, single-concern commits. One logical change each. The history must read as if a person wrote it incrementally.
- Commit at each green test step, not in batches at the end.
- Conventional Commits: `feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`, `ci:`. Imperative mood, lower case, no trailing period.
- `main` is always green and always shippable. Vercel deploys from it.

### Test-driven development
- Write the failing test first. **Watch it fail.** Then the smallest code that passes. Then refactor. Then commit.
- No production code without a failing test that demanded it.
- Acceptance criteria in `docs/product/backlog.md` are the source of the test suite. Gherkin `Scenario` → `it(...)`. Cite the story id at the top of the test file: `// US-014`.
- Coverage gates: 90% on `packages/core`, 70% overall. The engine is where a bug means a *wrong number*, which is worse than a crash because nobody notices.

### Evolutionary delivery
- Thin vertical slices, never horizontal layers. Every increment ships end to end and is usable on its own.
- Never a milestone whose only output is documents, or only an API, or only a UI.
- Before starting a story: "if we stopped right after this, would a user still get something they want?" If no, the slice is wrong.

## Architecture rules that are easy to violate by accident

- **It must stay free.** Groq, Vercel Hobby and Supabase free tiers only. Never add a service that needs a credit card, and never add a paid API call to any default path.
- **No test may ever call Groq.** The free tier is 8 audio-hours a day shared by every user; a test suite that burned it would take the app down. Use `FakeTranscriptionProvider`.
- **There is no background worker and no queue.** Groq is fast enough to transcribe inside a request (ADR 0010). If something seems to need a queue, measure first — the last time we assumed it did, it cost three weeks of planned work for nothing.
- **`packages/core` has no I/O.** No network, no filesystem, no database, no `new Date()`, no `Math.random()`. Pure functions over plain data. This is what keeps the suite fast and deterministic — protect it.
- **Never call an external service directly.** Go through its port (`TranscriptionProvider`, `BlobStore`, `Clock`, `IdGenerator`, `AssistantModel`). Every port has a `Fake`. This pattern survived three vendor reversals in one day at a cost of one adapter each — it is the most valuable thing in the repo.
- **Never let an LLM count anything.** Counts come from SQL aggregates. The model phrases answers; it does not do arithmetic. See `docs/adr/0007`.
- **Speaker attribution comes from per-host track ENERGY, never from transcribing each track.** Transcribe the mixed master once; attribute each word to whichever host's RMS envelope is loudest across its time span. Transcribing per-host tracks double-counts via mic bleed and blows the rate limit — see `docs/adr/0011`. No per-host tracks? No speaker breakdown, and the UI says so.
- **Split episodes into ~20–25 min chunks in the browser, on silence boundaries**, and transcribe them in parallel. This is what keeps the no-worker design viable, not an optimisation. Never split on a fixed clock — a cut mid-word corrupts the counts at the join.
- **Timestamp offsetting when stitching chunks is the highest-risk code in the repo.** It fails silently: counts stay plausible but point at the wrong moment. It keeps its property test against a single-pass transcript.
- **Never discard `transcripts.raw_provider_payload`.** It is how we re-derive everything without spending the daily transcription allowance twice.
- **Bump `pipeline_version` whenever analysis output changes.** Otherwise stale counts persist silently.
- **Encode to 16 kHz mono Opus in the browser** before upload. Whisper downsamples to 16 kHz mono anyway, so anything more is wasted bytes against a 1 GB storage tier.
- **Never store one row per token.** Word timings go in `utterances.words` as compact JSONB; counts live in `term_counts`. A 2-hour episode is ~20k words, and row-per-token would fill the free database at ~110 episodes.
- **Episodes are 1h40–2h.** That is the normal case, not an edge case. Throughput at the free tier is one episode per hour and four per day; storage is ~45 episodes. Surface remaining allowance in the UI rather than failing opaquely.
- Validate at every boundary with the Zod schemas in `packages/contracts`.

## Commands

```bash
pnpm dev               # next dev
pnpm test              # unit + integration, watch — the inner loop
pnpm test:unit         # pure, instant
pnpm test:integration  # needs: supabase start
pnpm test:e2e          # Playwright
pnpm verify            # exactly what CI runs
pnpm typecheck
```

`pnpm verify` passing locally must mean CI passes. If they can disagree, CI is wrong — fix CI.

## Environment

```
GROQ_API_KEY=                     # free, no card: console.groq.com
NEXT_PUBLIC_SUPABASE_URL=         # free, no card: supabase.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Nothing else. No payment method is needed to run this project.
