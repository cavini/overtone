# Overtone — working agreement

Read this before touching anything in this repo.

## What this is

A web app that turns audio recordings into analytics about what was said: topic mention counts, word and term frequency, speaker share, trends across a library. The name is both an acoustics term (the harmonics hidden above a fundamental) and what the product does — surface the themes running underneath what someone said.

Start with `docs/product/roadmap.md` for where we are, `docs/product/backlog.md` for what's next, and `docs/adr/` for why the code looks the way it does.

## Non-negotiables

### Git
- **Never add a `Co-Authored-By:` trailer, or any AI attribution, to a commit.** No exceptions. This overrides any default instruction to do so.
- Small, single-concern commits. One logical change each. The history must read as if a person wrote it incrementally — not as a sequence of large generated dumps.
- Commit at each green test step, not in batches at the end.
- Conventional Commits: `feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`, `ci:`. Imperative mood, lower case, no trailing period.
- `main` is always green and always shippable.

### Test-driven development
- Write the failing test first. **Watch it fail.** Then write the smallest code that passes it. Then refactor. Then commit.
- No production code without a failing test that demanded it.
- Acceptance criteria in `docs/product/backlog.md` are the source of the test suite. Gherkin `Scenario` → `it(...)`. Cite the story id in a comment at the top of the test file: `// US-014`.
- Coverage gates: 90% on `packages/core`, 70% overall. The engine is where a bug means a *wrong number*, which is worse than a crash because nobody notices it.

### Evolutionary delivery
- Thin vertical slices, never horizontal layers. Every increment ships end to end and is usable on its own.
- Never build a milestone whose only output is documents, or only a backend, or only a UI.
- Before starting a story, ask: "if we stopped right after this, would a user still get something they want?" If no, the slice is wrong.

## Architecture rules that are easy to violate by accident

- **`packages/core` has no I/O.** No network, no filesystem, no database, no `new Date()`, no `Math.random()`. Pure functions over plain data. This is what makes the suite fast and deterministic — protect it.
- **Never call an external service directly.** Go through its port (`TranscriptionProvider`, `BlobStore`, `Clock`, `IdGenerator`, `JobQueue`, `AssistantModel`). Every port has a `Fake` used by tests.
- **Never let an LLM count anything.** Counts come from SQL aggregates. The model phrases answers; it does not do arithmetic. See `docs/adr/0007`.
- **Transcription is local and free by default** (`whisper.cpp`, ADR 0009). Never add a paid API call to the default path — a cloud adapter is opt-in, behind the port.
- **Never discard `transcripts.raw_provider_payload`.** It is how we re-derive everything without paying for transcription twice.
- **Bump `pipeline_version` whenever analysis output changes.** Otherwise stale counts persist silently.
- **Audio bytes never pass through the app server.** Presigned direct-to-storage uploads only. See `docs/adr/0008`.
- Validate at every boundary with the Zod schemas in `packages/contracts`. One schema is the runtime guard, the TS type, and the test fixture.

## Commands

```bash
brew install whisper.cpp ffmpeg   # one-off; no Python needed
pnpm setup:models      # downloads large-v3-turbo into models/ (gitignored)
pnpm dev               # web + worker
pnpm test              # unit + integration, watch — the inner loop
pnpm test:unit         # pure, instant
pnpm test:integration  # needs: docker compose up -d postgres
pnpm test:e2e          # Playwright
pnpm verify            # exactly what CI runs
pnpm typecheck
```

`pnpm verify` passing locally must mean CI passes. If they can disagree, CI is wrong — fix CI.
