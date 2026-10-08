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

## Definition of done

A story is done when:

- [ ] Every acceptance criterion has a test that fails without the implementation
- [ ] `pnpm verify` is green
- [ ] It works end to end in the running app, not just in tests
- [ ] No new `any`, no new `@ts-ignore`, no skipped tests
- [ ] Docs updated if behaviour changed; an ADR added if a decision was made
- [ ] Committed in small, readable steps
