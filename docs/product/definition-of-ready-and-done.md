# Overtone — Definition of Ready & Definition of Done

Tuned for TDD, small commits, and a trunk that is always shippable. Gates marked **[auto]** are machine-checkable and must be enforced in CI, not by opinion.

---

## Definition of Ready — a story may be started when…

| # | Gate | Check |
|---|---|---|
| R1 | It states user value in the "As a … I want … so that …" form, and the *so that* names an outcome for a real persona — not a technical convenience. | Review |
| R2 | Acceptance criteria exist as Gherkin scenarios with concrete numbers, states and message text. No scenario contains "appropriate", "informed", "correct", "nice", "handled" or "etc." | **[auto]** lint the `.md` for a banned-vagueness word list and for `Scenario:`/`Given`/`When`/`Then` presence |
| R3 | At least one **negative or edge-case** scenario is present. | **[auto]** ≥ 2 scenarios per story, and story text must not be the only scenario |
| R4 | Every AC is observable through the UI or a public API — never only through a database row or a log line. | Review |
| R5 | Test data is named and available: a committed fixture file, a seeded Library, or a recorded ASR response replayed by the fake provider. Fixtures with expected counts are stated in the AC. **No test ever calls the real transcription service** — the allowance is shared with real users. | **[auto]** named fixture exists in the repo |
| R6 | No unresolved ⚠️ NEEDS CONFIRMATION blocks the story's AC. Open questions elsewhere in the doc do not block. | Review |
| R7 | Size is **S or M**. An L story is not Ready — it must be split first, and `backlog.md` names the split. | Review |
| R8 | Dependencies are merged to trunk, not merely in progress. | **[auto]** linked stories closed |
| R9 | A free-tier budget is stated where the story touches the pipeline: **audio-hours of the shared allowance**, storage bytes, database rows, or payload size — plus latency. There is no money budget; the free-tier ceilings in `backlog.md` are the budget. | Review |
| R10 | It is demoable in under 2 minutes by a person who did not write it. The demo script is one line in the story. | Review |

**Not Ready** means: not pulled. Clarify or split instead of starting.

---

## Definition of Done — a story is finished when…

### Correctness
| # | Gate | Check |
|---|---|---|
| D1 | Every Gherkin scenario in the story is automated and passing. One test (or test case) maps to one scenario, named after it. | **[auto]** scenario-to-test name mapping report, 100% coverage of scenarios |
| D2 | The test-first sequence is visible in history: a commit where the new test fails, then a commit where it passes. | **[auto]** CI replays the failing-test commit and asserts it fails |
| D3 | Changed-line coverage ≥ 80%; overall coverage does not decrease. | **[auto]** |
| D4 | No test is skipped, `.only`, or marked flaky-tolerant. | **[auto]** |
| D5 | Regression suite green on trunk, including the invariant tests below. | **[auto]** |

### Shippability
| # | Gate | Check |
|---|---|---|
| D6 | Merged to trunk in commits that each keep trunk green and deployable. No long-lived branch. | **[auto]** CI green per commit |
| D7 | Deployed to production, either on by default or behind a flag whose removal is ticketed. | **[auto]** deploy record + flag inventory has no flag older than 14 days |
| D8 | Reversible: either a backwards-compatible migration or a tested rollback path. Destructive migrations require an expand/contract plan. | **[auto]** migration check + review |
| D9 | Lint, format and type checks clean with zero new warnings. | **[auto]** |
| D10 | No new high or critical dependency vulnerability. | **[auto]** |

### Trust and operability (Overtone-specific invariants)
| # | Gate | Check |
|---|---|---|
| D11 | **No count without provenance.** If the story renders or returns a count, a test asserts the count drills down to its Tokens, and that every returned quote actually contains the matched term. | **[auto]** |
| D12 | **No non-terminal limbo.** If the story touches the pipeline, a test asserts every Episode reaches `ready` or `failed`, including on timeout, and that a failure in one chunk does not discard the chunks that succeeded. | **[auto]** |
| D13 | **Engine agreement.** If the story adds a counting surface, a test asserts it returns the same number as the Query engine for the same question. | **[auto]** |
| D14 | **Tenancy.** If the story adds a read path, a test asserts another user's id returns not-found. The Share Link (US-039) is the one deliberate exception, and its test asserts the opposite *plus* that no audio, no other Episode and no Library is reachable through it. | **[auto]** |
| D15 | Error paths produce the exact message text stated in the AC — asserted on the string, not on the status code alone. | **[auto]** |
| D16 | The R9 budget is asserted or measured, and the measured value is recorded in the PR. If the story can spend the transcription allowance, a test asserts it is spent **once** — never twice for the same audio. | **[auto]** where assertable |
| D17 | A log line exists for the story's success and failure paths, with the Episode status included. | Review |

### Communication
| # | Gate | Check |
|---|---|---|
| D18 | If the story introduced, renamed or redefined a domain noun, `glossary-and-domain.md` is updated in the same commit. | **[auto]** domain-term diff check |
| D19 | If a ⚠️ NEEDS CONFIRMATION was resolved, the decision and its rationale replace the flag in the relevant doc. | Review |
| D20 | Demoed against the R10 script on the deployed environment, not on a developer machine. | Review |

---

## Explicitly *not* in the Definition of Done

| Excluded | Why |
|---|---|
| 100% code coverage | Drives tests toward trivia. Scenario coverage (D1) is the real gate. |
| A design sign-off step | Would create a handoff queue. Design constraints belong in the AC. |
| A separate QA phase | TDD + D1 is the test strategy. A QA gate would make trunk not-always-shippable. |
| Written documentation per story | Only the glossary (D18) and the decision log (D19) are mandatory. |
| Perfect ASR accuracy | Out of our control. The promise is verifiability (D11) and honest warnings, not ground truth. |
| A cost or spend gate | There is no spend. R9 covers the free-tier allowance instead, which is the only budget that exists. |

**Settled:** continuous deployment, every story, behind a flag where it needs one. There is no release train, no launch date and no stakeholder to batch for — the audience is four friends who will tell us directly. A cadence would break D6/D7 and turn evolutionary delivery back into phased delivery.
