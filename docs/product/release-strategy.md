# Overtone — Release Strategy

One person, a hobby app, free hosting that deploys itself. The whole strategy is: **push to `main`, Vercel deploys it, friends use it.** Everything below exists only because it stops a wrong number reaching the group.

There is no environments ladder, no staging, no release train, no rollout plan, no flag ceremony. Those were for a product being sold.

---

## Deploy

| | |
|---|---|
| **Mechanism** | Vercel Hobby auto-deploys every push to `main`. That is the release process. |
| **Previews** | Vercel builds a preview per branch for free. Use one when the stakeholder should look at something; otherwise don't bother. |
| **Local** | `pnpm dev` against a local Supabase, fake transcription by default. |
| **Rollback** | `git revert`, push, it redeploys. Minutes. For the assistant, turn its flag off. Seconds. |
| **Migrations** | Expand, never contract in the same push: add columns, deploy code that writes them, backfill, then read them. Don't drop anything the week it stops being read. This is the one rule that keeps a revert from needing a down-migration, and friends' episodes are not re-uploadable. |
| **Secrets** | Four env vars (`GROQ_API_KEY`, three Supabase keys). Nothing else. Never in the repo. |

**Shipped** means: on `main`, deployed, and a friend has done the increment's user-visible thing in prod. "Works locally", "just needs the UI" and "done except tests" are not shipped.

---

## Keeping `main` green

| Gate | Where | Budget | Blocks? |
|---|---|---|---|
| Format, lint, types | pre-commit + CI | <40 s | yes |
| Unit tests — counting, variant folding, **chunk offsets**, **pt-BR normalisation** | pre-commit + CI | <60 s | yes |
| Integration tests — real DB, fake transcription | CI | <3 min | yes |
| One e2e smoke: upload → transcript → count rendered | CI | <2 min | yes |
| Coverage floors (90% `packages/core`, 70% overall) | CI | — | yes |

**No test may ever call Groq.** The free allowance is 7,200 audio-seconds an hour, shared with real users — a test suite that touched it would take the app down for the group. `FakeTranscriptionProvider` with recorded fixtures, always, including the multi-chunk fixture that guards timestamp stitching.

Never push on red. A red `main` is the only emergency, and reverting is the first move, not the second. Flaky tests get fixed or deleted inside a day — a tolerated flake teaches you to ignore red.

---

## Branches, flags, versions

- `main` is the only branch that matters. Short branches (hours, not days) when a preview URL or a second look is useful; direct to `main` otherwise. A self-approved PR is theatre.
- **One flag: `assistant`**, default off, for the *Later* chat lane. That's the whole flag set. If a second one appears, something is being built too big.
- Tag a version when an increment ships, with the exit criteria in the annotation. That is the changelog. No ceremony beyond it.

---

## How we work — the part that isn't negotiable

**TDD loop:** smallest failing test → watch it fail → simplest code that passes → refactor → commit. Repeat.

Counting, variant folding, **chunk timestamp offsets** and the **pt-BR normalisation path** are test-first without exception — they are where a bug produces a *wrong number* instead of a crash, and nobody notices a wrong number. UI gets behaviour-level tests, not pixel snapshots. Every bug gets a failing test before the fix, permanently.

Three pt-BR tests are permanent fixtures of the suite, not milestone chores (ADR 0014):

| Test | Guards | From |
|---|---|---|
| `e`/`é`, `por`/`pôr` stay distinct terms | accent-stripping normalisation (R29) | M0, first commit |
| colloquial-only and standard-only fixtures of the same speech give **identical counts** | Whisper's written-standard rewriting (R27) | M2 |
| a committed table of pt-BR near-miss pairs (`casa`/`casar`, `com`/`comer`) never merges | stemmer over-merge (R28) | M2 |

**Commits:**
- Many small ones, one idea each, typically 10–60 lines. A subject that needs "and" is two commits. Commit at each green step, never in a batch at the end.
- Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`, `ci:`), imperative, lower case, no trailing period. `feat: offset chunk timestamps by their start position`, not `feat(audio): implement stitching layer`.
- **No `Co-Authored-By` trailers. No "generated with" footers. No AI attribution anywhere in the history.** Per `CLAUDE.md`, no exceptions.
- Never commit red. Never commit a transcript, an episode, or a real audio file — fixtures are short and committed deliberately.
- Rebase, linear history, never squash. Squashing throws away the small commits that are the point.

Coverage is a **floor, not a score**: it blocks a merge and is never reported as progress.
