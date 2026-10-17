# ADR 0035 — The series word totals are stored

**Date:** 2026-10-17 · **Status:** accepted

## Context

The series view shows the words said most across every finished episode. The
numbers come from `term_counts`, which holds one row per episode and lemma.

I asked for this precomputed. Then I measured the aggregate — 106 ms for the
top 25 over 24 episodes, 90 ms to total *every* term — decided that was cheap,
and argued myself into computing it per view instead.

That was a true measurement and the wrong conclusion. One query being fast
says nothing about repeating it forever for an answer that has not moved. And
it was worse than it looked: the series panel is fetched on **every page load**
and again after every upload, so per-view meant recomputing on every visit —
more often than once per episode, not less.

The totals change at exactly two moments: an episode finishes analysis, or a
correction re-derives one.

## Decision

**Totalled when the data behind them changes, into `series_term_totals`, and
read from an index after that.**

- Rebuilt by `recountSeriesTerms`, called when `advanceOnce` sees an episode
  reach `ready`. A correction goes through the same path, so editing a line
  re-totals the series.
- **Rebuilt whole, not incrementally.** A correction can push a word's total
  *down* and an episode can be deleted, so adding to what is stored would
  drift upward with no reader able to tell.
- One statement: the aggregate and the write are the same round trip, so at a
  hundred episodes roughly 180,000 rows stay where they are.
- A standalone function rather than a method on `DrizzleSeriesRepository`,
  which scopes every query to a signed-in member. This runs from the scheduled
  step and has nobody to scope to, and hiding an unscoped write among
  member-scoped reads is how one of them quietly loses its check.
- `pnpm --filter @overtone/db db:recount-words` rebuilds by hand, for when the
  automatic rebuild did not happen.
- Fetched on its own route, the first time the folded table is opened. Cheap
  to read is not a reason to read it for somebody who has not asked.

## Consequences

- Reading is 53 ms against 107 ms for the aggregate, and most of the 53 is the
  round trip to Supabase rather than work.
- The table costs 1.56 MB for 11,400 words.
- A failed rebuild leaves stale totals rather than a broken episode: the
  recount is wrapped, because by then the episode is analysed and stored and a
  roll-up that would not write is not a reason to call it broken.
- `counted_at` records when each row was built. Nothing reads it yet; it is
  there so a stale table can be spotted rather than trusted.
- **The reasoning worth keeping:** "it is fast enough" answers a different
  question from "should this happen at all". Work that produces the same
  answer every time belongs where the answer changes, not where it is read.
