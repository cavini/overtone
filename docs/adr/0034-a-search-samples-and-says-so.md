# ADR 0034 — A search samples every episode, and says so

**Date:** 2026-10-17 · **Status:** accepted · **Supersedes:** the row budget in ADR 0013's search notes

## Context

Searching reads matching lines of transcript and groups them into moments. The
work is bounded by a budget, because a word said four hundred times does not
need four hundred rows to show where it was discussed.

**How that budget is spent has now been wrong three times, each time in a way
that looked right.** Writing the history down because the next version will be
tempted by one of them again.

1. **Newest-first, 300 rows across the library.** A term discussed at length
   in episode 1 vanished the moment 300 segments in later episodes mentioned
   it in passing.
2. **Busiest-episode-first, 300 rows across the library.** Sounds like a
   ranking, behaves like a cliff. Measured on a real library of fifteen
   episodes, "cara" matched 2,567 lines and the busiest episode held 321 of
   them — so that one episode took every row and the other fourteen were
   never looked at. The answer read as "it was only said there".
3. **The earliest 20 lines per episode.** Every episode appeared, but only its
   opening: every moment landed in the first 13 minutes of episodes running 35
   to 90. 80% of each episode was invisible.

Each of the three returned a partial answer that was indistinguishable from a
complete one. That is the failure this product can least afford — a wrong
number is worse than a crash because nobody notices.

A measurement that killed the obvious objection: returning **every** match for
the most frequent word took 66 ms against 62 ms for 300 rows. The cost is the
text-index scan; the rows were always the cheap half. So the budget was never
buying speed, and no cache would have helped — a cache makes a truncated
answer arrive faster.

## Decision

**Every nth matching line of each episode, and the page says how many there
are.**

- The step is the episode's own match count over the budget, so the sample is
  spread across the whole episode. An episode under the budget returns
  everything.
- `TranscriptMatch` carries `episodeMatches`, the episode's full count. The
  result carries `matchCount` across the library and `sampled`, and the page
  renders one of two sentences: *"3,810 matches in all. The list shows a
  sample from each episode."* or *"64 matches, all of them listed."*

## Consequences

- A frequent word now reaches the whole archive: "cara" goes from one episode,
  to fifteen openings, to 0–86 minutes into all 23.
- **Clustering is lost for frequent words.** Sampled hits are too far apart to
  group, so most moments hold one hit. Accepted: density says nothing about a
  word said three hundred times, and the alternative hid most of the episode
  to preserve it.
- Ordinary words are untouched — under the budget, nothing is sampled away.
- Two traps, both of which bit while writing this:
  - `rank % step = 1` is **silently empty when the step is 1**, so the
    episodes meant to return everything returned nothing. It is
    `(rank - 1) % step = 0`.
  - `count(*)` is a bigint and a bigint arrives as a **string**. `sql<number>`
    is a claim about the type, not a conversion, so summing the per-episode
    totals concatenated them and the page showed a count of
    `015518018815314918817022…`. Cast in SQL, and the live test asserts
    `typeof` as well as the value.
