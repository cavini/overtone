# Overtone — Release Strategy

One engineer, no release manager, no staging freeze. The strategy is therefore: **trunk-based, always-deployable, flags for anything unfinished, revert as the primary rollback.** Ceremony is the enemy; evidence is not.

---

## Environments

| Env | Purpose | Data | Deploy trigger | Who sees it |
|---|---|---|---|---|
| `local` | TDD loop | seeded fixtures; **fake ASR/LLM by default** | — | engineer |
| `preview` | One ephemeral deploy per branch/PR | throwaway DB per preview; fake ASR unless explicitly opted in | push to branch | engineer, occasionally the stakeholder for a UI read |
| `prod` | The product | real user data | merge to `main` (auto) | real users |

**No long-lived staging.** A third persistent environment for a solo dev becomes a place where bugs hide and data drifts. Previews cover "see it before merging"; prod plus flags cover everything else. The cost: prod is where real-audio integration problems surface — accepted, and mitigated by flags, a smoke test on every deploy, and the engineer being the first user of every increment.

**Paid APIs in tests are forbidden.** ASR and LLM live behind interfaces with recorded-fixture doubles (roadmap stack constraint). A test that can spend money is a broken test. One nightly job exercises the real provider against the golden set; it may fail without blocking merges, and its failure is a metric (R1), not a build break.

---

## Trunk-based development

- `main` is the only long-lived branch and is always deployable.
- Branches live **hours to two days**, never longer. A branch that can't merge in two days was scoped wrong.
- Flags, not branches, hold unfinished work. Incomplete code merges dark.
- No release branches, no `develop`, no cherry-pick trains.

### PR-or-direct-to-main policy

| Change | Path | Rationale |
|---|---|---|
| Refactor, test, copy, styling, docs, small behaviour change under a passing test | **Direct to `main`** | CI is the reviewer; a self-approved PR is theatre |
| Schema migration, auth/permission boundary, money-spending path (ASR/LLM), deletion logic, anything behind a new flag | **Short-lived branch + PR**, self-merged after CI green + a deliberate self-review of the diff | These are the four places where a mistake is expensive or irreversible |
| Anything the stakeholder should eyeball | Branch + PR for the preview URL | The preview link *is* the review |

Rule of thumb: if a mistake is revertible in one commit and harms nobody's data, push to `main`.

---

## What "shippable" means for a solo dev

An increment is shipped when **all** of these hold:

1. Deployed to prod from `main` — not merely merged.
2. A real user (design partner, or the engineer with real audio) completed the increment's user-visible path in prod.
3. The increment's exit criteria in [`roadmap.md`](./roadmap.md) are met, each backed by a test or a recorded measurement — not by inspection.
4. Its two metrics from [`metrics.md`](./metrics.md) are readable in prod.
5. No new always-on half-feature: anything incomplete is behind an off flag.
6. Migrations applied forward, data intact, no manual step left undocumented.
7. The README/ADR delta is committed in the same increment.

"Works on my machine", "just needs the UI", and "done except tests" are all **not shipped**.

---

## Keeping `main` green

| Gate | Where | Budget | Blocks merge? |
|---|---|---|---|
| Format + lint | pre-commit (fast), CI | <10 s | yes |
| Type check | pre-commit, CI | <30 s | yes |
| Unit + domain tests (counting, normalisation, state machine) | pre-commit, CI | <60 s | yes |
| Integration tests (fixture ASR, real DB, real storage stub) | CI | <3 min | yes |
| One e2e smoke: upload → process → statistic rendered | CI, and again against prod post-deploy | <2 min | yes |
| Golden-set accuracy run (real provider) | nightly | ~10 min | **no** — reports a metric |
| Migration up/down-compat check | CI, on migration diffs | <30 s | yes |

**Discipline, not tooling:** never push on red; a red `main` is the only P0 and everything stops until it's green. **Revert first, diagnose second** — a revert is one commit and restores users immediately; a forward fix under pressure is how 20-minute outages become 2-hour ones. Total pre-commit budget stays under ~90 s; past that the engineer starts skipping it, which costs more than the slow suite saves. Flaky tests get deleted or fixed within 24 hours — a tolerated flake trains you to ignore red.

---

## Feature flags

- **Mechanism:** server-evaluated, DB- or config-backed booleans with per-user overrides, read through one small module. Default **off**. No client-only flags for anything that spends money.
- **Scope:** one flag per risky capability, not per file. Current planned set: `assistant` (M5), `diarisation` (M3), `lang_detect_warning` (M4), plus kill switches `kill_uploads` and `kill_assistant`.
- **Hygiene:** every flag is born with a removal owner and a removal increment. A flag fully on for two weeks gets deleted along with its dead branch — stale flags are untested code paths. Max ~5 live flags; more than that and prod behaviour becomes unknowable for one person.
- **Not for:** incomplete refactors, or hiding an unmigrated schema. Flags gate *behaviour*, never data integrity.

### Rolling out the AI assistant (the worked example)

| Stage | Audience | Gate to advance | Spend cap |
|---|---|---|---|
| 0 | nobody (flag off, code merged dark) | CI green; 20-question eval suite passing ≥90% with 0 fabricated citations | — |
| 1 | engineer only | 30 real questions asked; cost/answer median ≤$0.05 | $5/day global |
| 2 | 3 friendly users | 1 week, no fabricated citation, no cost alarm, ≥3 questions/user/week | $15/day global, $1/user/day |
| 3 | 25% of users | 1 week, correctness and cost stable, trust incidents = 0 | $40/day global, $1/user/day |
| 4 | all users, still flagged | stays flagged indefinitely so it can be killed in one toggle | per-user cap, global alert |

**Preconditions (from R14):** no assistant work begins until M2 count accuracy passes and M3 aggregates exist. **Kill triggers at any stage:** one fabricated citation, cost/answer p95 >$0.15, or correctness <85% ⇒ flag off, no debate, diagnose with the flag off.

The assistant never counts: per ADR 0007 and `CLAUDE.md`, counts come from SQL aggregates and the model only phrases the answer. A rollout stage that reveals the model doing arithmetic is a kill trigger, not a tuning problem.

---

## Versioning

- **SemVer-ish `0.x` tags on `main`, one minor per increment:** `v0.1.0` = M1 ships, `v0.2.0` = M2, `v0.3.0` = M3, **`v1.0.0` = M4** (the first version worth showing a stranger), `v1.1.0` = M5, `v1.2.0` = M6. Patch bumps for fixes between increments. M0 is `v0.0.1` and makes no promises.
- Tags are cut at deploy, annotated with the exit criteria met. The tag is the increment's receipt.
- No changelog ceremony: the tag annotation plus the commit log *is* the changelog, which is exactly why commits must read like sentences.
- Prod displays the deployed commit SHA in the footer or `/health`. Debugging a report you can't version is guesswork.

---

## Rollback

| Failure | Action | Recovery |
|---|---|---|
| Bad code deployed | `git revert` the commit, push, auto-deploy | minutes |
| Bad feature behaviour | Flag off | seconds |
| Runaway spend | Kill switch + provider-side cap | seconds |
| Bad migration | Prevented, not rolled back — **expand/contract only** | see below |
| Vendor outage | Jobs stay queued and visibly `waiting`, never fail-and-lose; retry with backoff | automatic |
| Data loss | Daily DB snapshot, 7-day retention; restore drill rehearsed once at M1 | hours |

**Expand/contract migrations are mandatory:** add new columns/tables (expand) → deploy code writing both → backfill → deploy code reading new → delete old in a *later* increment (contract). No destructive change in the same deploy as the code that needs it. This way a code revert never requires a down-migration, which is the one rollback that reliably destroys data. Never drop a column in the same week it stops being read. An untested backup is not a backup — hence the M1 restore drill.

---

## How we work — one screen

**TDD loop**
1. Write the smallest failing test that expresses the next behaviour (**red**).
2. Simplest code that passes (**green**).
3. Refactor with the test as the net.
4. Commit. Repeat.

Counting, normalisation, the job state machine and spend metering are test-first without exception — they are the correctness core. UI gets tests at the behaviour level (state renders, event fires), not pixel snapshots. Every bug gets a failing test before a fix, permanently.

**Commits**
- Many small commits — typically 10–60 lines, one idea each. A commit that needs "and" in its subject is two commits. Commit at each green test step, never in a batch at the end.
- **Conventional Commits, per `CLAUDE.md`:** `feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`, `ci:` — imperative, lower case, no trailing period. The prefix is required; what is banned is spec-speak after it. Write `feat: collapse hyphen variants when matching topics`, not `feat(topics): implement normalization layer per spec` and not `fix: stuff`.
- **No `Co-Authored-By` trailers. No "Generated with" footers. No AI attribution anywhere in the history.** The log should read as one person's hand-written work, because that's what it has to be maintainable as.
- Never commit red. Never commit a secret, a transcript, or a real audio file — fixtures are short, synthetic, and committed deliberately.
- Rebase to keep history linear; no merge commits on `main`.
- Commit messages explain *why* when the diff can't: constraints, trade-offs, and anything surprising.

**Merging**
- Direct to `main` for safe changes; short-lived branch + PR for schema, auth, spend, deletion, or flagged work (table above).
- Rebase before merge; linear history; **never squash** — squashing destroys the small-commit history that is the point.

**CI gates (all must pass to merge):** `pnpm verify` — format · lint · types · unit · integration · e2e smoke · migration compat · coverage floors (90% `packages/core`, 70% overall, per `CLAUDE.md`). `pnpm verify` passing locally must mean CI passes; if the two can disagree, CI is wrong. Nightly and non-blocking: golden-set accuracy, cost-per-hour report.

Coverage is a **floor, not a score**: it blocks a merge below the line and is never reported as progress or optimised upward (see the anti-metrics in [`metrics.md`](./metrics.md)). The reason the floor is highest on `packages/core` is that a bug there produces a *wrong number* rather than a crash — and nobody notices a wrong number.

**Definition of done:** test-covered, deployed to prod, exit criterion observable, metric readable, flag state deliberate, docs delta committed.
