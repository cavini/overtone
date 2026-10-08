# Contributing

## The loop

```
pick the next story from docs/product/backlog.md
   → write the failing test from its acceptance criteria
   → watch it fail
   → smallest code that makes it pass
   → watch it pass
   → refactor
   → commit
```

One trip through that loop is one commit. If a commit contains two trips, it should have been two commits.

## Commits

Conventional Commits, imperative mood, lower case, no trailing period:

```
feat(core): count compound term variants as one topic
test(core): add golden transcript for filler word exclusion
fix(worker): make analyse idempotent on pipeline_version match
refactor(core): extract annotate from countTerms
docs(adr): record why the assistant uses tool use over RAG
chore(deps): add wink-nlp
ci: run integration tests against postgres service
```

Scopes follow the workspace: `core`, `db`, `contracts`, `web`, `worker`, `ui`, `adr`, or omitted.

**Rules**

- One concern per commit. A commit that touches the schema, the API and the chart is three commits.
- A commit must leave `main` green. If the tests don't pass, it isn't a commit yet.
- Test and implementation may share a commit when they are the same thought (the red-green pair). Prefer that over a `test:` commit that leaves the suite red.
- **No `Co-Authored-By:` trailer. No AI attribution of any kind.**
- Write the body only when the *why* isn't obvious from the subject. Then explain the why, not the what — the diff already says what.

## Branching

Trunk-based. Short-lived branches off `main`, merged within a day, or commit straight to `main` for small green changes. Nothing lives long enough to need a merge strategy.

Risky or half-built capabilities go behind a flag in `packages/contracts/flags.ts` and ship dark rather than living on a branch. A branch that survives a week is a planning failure.

## Architecture rules that are easy to violate by accident

- **It must stay free.** Groq, Vercel Hobby and Supabase free tiers only. Never add a service that needs a credit card, and never add a paid API call to any default path.
- **No test may ever call Groq.** The free transcription allowance is shared across every user of the app, so a test suite that burned it would take the app down. Use `FakeTranscriptionProvider`.
- **There is no background worker and no queue.** Transcription is fast enough to run inside a request (`docs/adr/0010`). If something seems to need a queue, measure first.
- **`packages/core` has no I/O.** No network, no filesystem, no database, no `new Date()`, no `Math.random()`. Pure functions over plain data — this is what keeps the suite fast and deterministic.
- **Never call an external service directly.** Go through its port (`TranscriptionProvider`, `BlobStore`, `Clock`, `IdGenerator`, `AssistantModel`). Every port has a `Fake`. This pattern survived three vendor reversals at a cost of one adapter each; it is the most valuable thing in the repo.
- **Never let an LLM count anything.** Counts come from SQL aggregates. The model phrases answers; it does not do arithmetic (`docs/adr/0007`).
- **Split episodes into ~20–25 min chunks in the browser, on silence boundaries**, and transcribe them in parallel (`docs/adr/0011`). Never split on a fixed clock — a cut mid-word corrupts the counts at the join.
- **Timestamp offsetting when stitching chunks is the highest-risk code here.** It fails silently: counts stay plausible but point at the wrong moment. It keeps its property test against a single-pass transcript.
- **Never discard `transcripts.raw_provider_payload`.** It is how we re-derive everything without spending the transcription allowance twice.
- **Bump `pipeline_version` whenever analysis output changes**, or stale counts persist silently.
- **Never store one row per token.** Word timings go in `utterances.words` as compact JSONB; counts live in `term_counts`.
- **Encode to 16 kHz mono Opus in the browser** before upload. Whisper downsamples to 16 kHz mono anyway, so anything more is wasted bytes against a 1 GB storage tier.
- Validate at every boundary with the Zod schemas in `packages/contracts`.

## Commands

```bash
pnpm dev               # next dev
pnpm test              # unit + integration, watch - the inner loop
pnpm test:unit         # pure, instant
pnpm test:integration  # needs: supabase start
pnpm test:e2e          # Playwright
pnpm verify            # exactly what CI runs
pnpm typecheck
```

`pnpm verify` passing locally must mean CI passes. If they can disagree, CI is wrong - fix CI.

## Definition of done

A story is done when:

- [ ] Every acceptance criterion has a test that fails without the implementation
- [ ] `pnpm verify` is green
- [ ] It works end to end in the running app, not just in tests
- [ ] No new `any`, no new `@ts-ignore`, no skipped tests
- [ ] Docs updated if behaviour changed; an ADR added if a decision was made
- [ ] Committed in small, readable steps
