# Testing Strategy

**Status:** proposed · **Principle:** acceptance criteria are not documentation, they are the test suite's source code.

---

## 1. The loop

Every change follows the same cycle, and each cycle is one commit:

```
pick the next story → write the failing test from its Gherkin AC → watch it fail
   → smallest code that passes → watch it pass → refactor → commit
```

Rules we hold ourselves to:

- **No production code without a failing test that demanded it.** If a test can't be written for it, that's a signal the design is wrong or the story is unclear — go fix that, not the test.
- **Watch the test fail first.** A test that has never failed has never been proven to test anything. This catches the single most common bug in test suites: the assertion that passes because of a typo.
- **Commit on green.** `main` is never red. See `../product/release-strategy.md`.
- **Red-green-refactor, with the refactor actually happening.** The refactor step is where the design comes from; skipping it is how TDD degrades into "tests written first, badly."

---

## 2. The shape of the suite

```
        ╱╲          E2E — Playwright
       ╱  ╲         one per user journey. Real browser, real Postgres,
      ╱ ~8 ╲        faked transcription. Slow, few, precious.
     ╱──────╲
    ╱        ╲      Integration — Vitest
   ╱   ~60    ╲     Route Handlers, repositories, the worker pipeline.
  ╱            ╲    Real Postgres via Supabase. Groq faked with MSW, always.
 ╱──────────────╲
╱                ╲  Unit — Vitest
│      ~400+      │ packages/core. Pure functions. No I/O, no DB, no clock.
│                 │ Microseconds each. This is where TDD actually lives.
└─────────────────┘
```

Counts are targets of proportion, not quotas. The shape matters: the analysis engine is pure and is the product, so it gets overwhelming coverage cheaply; the browser layer is expensive, so it gets one confident pass per journey.

| Layer | Tool | Runs against | Target |
|---|---|---|---|
| Unit | Vitest | nothing — pure functions | < 2 s whole layer |
| Integration | Vitest + a Supabase branch (or local `supabase start`) | real Postgres, faked HTTP | < 30 s |
| Contract | Vitest + Zod | committed Groq response fixtures | < 1 s |
| E2E | Playwright | full app, `FakeTranscriptionProvider` | < 2 min |

No test ever calls Groq. The free tier is 8 audio-hours a day shared across every user of the app — a test suite that burned it would take the product down, which makes `FakeTranscriptionProvider` a availability requirement rather than just good practice.

---

## 3. From Gherkin to code

The PO's acceptance criteria translate mechanically. Given this AC:

```gherkin
Scenario: Compound term variants count as one topic
  Given a topic "Hotdogs" with patterns "hotdog", "hot dog", "hot-dog"
  And a transcript containing "I love a hotdog, but a hot-dog costs more than a hot dog"
  When the analysis runs
  Then the topic "Hotdogs" has 3 mentions
  And each mention records its own start and end timestamp
```

the test is:

```ts
describe('findMentions', () => {
  it('counts hotdog, hot dog and hot-dog as one topic', () => {
    const topic = topicFixture({ name: 'Hotdogs',
      patterns: ['hotdog', 'hot dog', 'hot-dog'] })
    const tokens = annotate(tokenise(
      'I love a hotdog, but a hot-dog costs more than a hot dog'))

    const mentions = findMentions(tokens, topic)

    expect(mentions).toHaveLength(3)
    expect(mentions.map(m => m.matchedText))
      .toEqual(['hotdog', 'hot-dog', 'hot dog'])
    mentions.forEach(m => {
      expect(m.startMs).toBeTypeOf('number')
      expect(m.endMs).toBeGreaterThan(m.startMs)
    })
  })
})
```

`Scenario` → `it`. `Given` → fixtures. `When` → the call. `Then` → assertions, one per `Then`/`And`.

We do **not** install Cucumber. The Gherkin lives in the backlog where the PO owns it; the tests live in code where they run fast and refactor with the types. Each test file header cites the story id (`// US-014`) so traceability survives without a framework in the middle. A `pnpm test:trace` script greps those markers and reports which stories have no covering test — cheap traceability, zero ceremony.

---

## 4. Fixtures and fakes

| Thing | Approach |
|---|---|
| Audio | Five committed clips in `fixtures/audio/`: 5 s clean single speaker, 30 s two hosts on separate tracks, 10 s heavy background noise, 2 s silence, and one just over 25 MB to exercise the compress-and-chunk path. Small enough for git, real enough to be honest. |
| Transcription responses | Canned Groq `verbose_json` in `fixtures/transcripts/`, captured once from the real API and checked in. Every fixture is validated against the provider's Zod schema by a contract test — so an upstream shape change breaks a fast test instead of production. |
| `FakeTranscriptionProvider` | Returns a fixture keyed by blob name. Instant, offline, deterministic. Used by every test including E2E. |
| Database | Real Postgres — `supabase start` locally, or a Supabase branch in CI. Each integration test runs in a transaction that is rolled back. No mocking the DB — the DB is where half the logic is. |
| Time | `FakeClock` with an injected fixed instant. No `new Date()` in product code. |
| IDs | `FakeIdGenerator` returning `rec_001`, `rec_002`… so snapshots are stable. |
| External HTTP | MSW. Also used to simulate the failures that matter: 429, 500, timeout, and a truncated response body. |

The one thing we never fake is the analysis engine. It is the product; it is always real in every test.

---

## 5. The tests that defend the product's credibility

Ordinary coverage is not enough for a measurement product. Four specific guards:

1. **Determinism (property test).** Same transcript + same `pipeline_version` → byte-identical counts, across 100 generated transcripts. If this breaks, every number we have ever shown a user becomes untrustworthy.
2. **Golden transcripts.** Three hand-counted transcripts with human-verified expected counts, asserted exactly. These are the regression net for every future change to tokenisation or lemmatisation — the changes most likely to silently shift numbers.
3. **Conservation.** For any transcript: `sum(term_counts.count) + stopword_count == word_count`. A single invariant that catches a whole family of double-counting and dropped-token bugs.
4. **Privacy.** `DELETE /api/episodes/:id` removes the row **and** the audio. Asserted on the `BlobStore` fake. A promise to the user, so it gets an explicit test rather than being assumed.
5. **Timestamp stitching.** For audio split across chunks, the reassembled word timestamps must match a single-pass transcript of the same audio. An off-by-one in a chunk offset silently misplaces every count after the join — the kind of bug that produces plausible numbers pointing at the wrong moment.

---

## 6. What we deliberately do not test

- **Third-party transcription accuracy.** Not ours to assert. We test that we handle whatever shape comes back, including bad shapes.
- **Visual appearance.** No pixel snapshots in the MVP — they break on every legitimate design change and train people to approve diffs blindly. We assert structure, labels, and a11y roles. Revisit once the design settles.
- **Next.js, Drizzle, or Supabase internals.** We test our usage, not their implementation.
- **Getters, DTO passthroughs, config objects.** Coverage theatre.

Coverage gate: **90% on `packages/core`**, 70% overall. The asymmetry is deliberate — the engine is where a bug means a wrong number, and a wrong number is worse than a crash because nobody notices it.

---

## 7. Commands

```bash
pnpm test              # unit + integration, watch mode — the inner loop
pnpm test:unit         # pure, instant
pnpm test:integration  # needs: supabase start
pnpm test:e2e          # Playwright
pnpm test:trace        # stories with no covering test
pnpm typecheck         # tsc --noEmit across the workspace
pnpm verify            # everything CI runs, locally
```

`pnpm verify` passing locally must mean CI passes. If the two can ever disagree, CI is wrong and gets fixed.

---

## 8. CI gates

Every push, in order, fail fast:

```
typecheck → lint → test:unit → test:integration (supabase) → build → test:e2e
```

Merge to `main` is blocked on all six. No exceptions, no "just this once" — the moment `main` can be red, it is red.
