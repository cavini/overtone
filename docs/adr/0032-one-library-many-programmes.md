# ADR 0032 — One library, many programmes

**Date:** 2026-10-14 · **Status:** accepted · **Amends:** ADR 0006 (topics are series-wide — now load-bearing for a reason it did not have)

## Context

The group does not publish one show. They publish several, from a single feed
and a single account, each numbering its episodes from 1. Until now the app
assumed one show per library: `episodes` was unique on `(series_id, number)`,
so the second programme's first episode could not be uploaded at all.

The obvious fix is a series per programme. It is the wrong one, and the reason
is the thing that makes this app worth having.

**The programmes share hosts, things and running jokes.** A bit that starts on
one show turns up on another. The stakeholder's words: *"all the programs and
podcasts are part of the same universe, they have the same hosts, things and
jokes are shared between them"* — and, separately, *"the most important thing
is that the search is universal and stuff can be searched from all different
episodes from different categories"*.

Two pieces of the existing design turn that from a preference into a
constraint:

- **`topics` hang off `series`** (ADR 0006). A series per programme means
  defining the same running joke once per programme, and counts that never
  add up across them. "How often do we do this bit" — the question the
  product exists to answer — would return a fraction of the truth, silently.
- **Search is scoped by `series_id` and nothing narrower.** A series per
  programme would have quietly made search per-programme. Nothing would have
  errored; results would just have been missing, and the one explicitly
  stated hard requirement broken.

So the tidier-looking model breaks both headline features while every test
still passes. That is the failure mode this repo keeps meeting and the reason
this decision is written down rather than assumed.

## Decision

**A programme is a label on the episode, never a partition of the library.**

- `episodes.category` holds which programme an episode is, read from the
  filename: the name left once the trailing number comes off. Nullable,
  because a filename with no number has no programme-and-number to split and
  inventing one would file the episode under a show that does not exist.
- Uniqueness is `(series_id, category, number)` with **`nulls not distinct`**.
  Each programme counts from 1, so two of them having a first episode is
  normal; the same number twice inside one programme is still the duplicate
  upload that constraint has always refused. Without `nulls not distinct`
  Postgres treats every NULL as its own value and two uncategorised episodes
  numbered the same would slip through as "two programmes".
- `nextEpisodeNumber` counts within a programme, or an uncategorised upload
  lands at 203 because another show has reached 202.
- **Topics stay series-wide.** Unchanged, and now deliberately so: it is what
  lets one joke be counted across programmes.
- **Search stays series-scoped.** Unchanged, and now deliberately so: it is
  what keeps search universal.

The feed lookup is scoped by the same label. The feed carries every
programme, almost nobody sets `itunes:episode`, so the number is read from the
title — where the programmes collide. On the real feed nine numbers are
claimed by two or more shows, and five of one programme's first ten episodes
resolved to a different programme's title entirely.

## Consequences

- The library can read in sections without anything else changing. Grouping is
  a presentation concern over one flat set of episodes.
- Cross-programme counting and universal search are free rather than
  features — they are what you get by *not* partitioning.
- A category is only as good as the filename. `<programme>-<number>.ext` is
  the shape that parses; a `#` before the number stops the number being read
  at all, which is worth knowing before bulk-importing anything.
- Nothing migrates. Existing episodes have a null category and keep working;
  they simply read as uncategorised until renamed.
- **The limit this does not remove:** a per-programme view of a joke's trend
  needs the counts filtered by category at query time. The data supports it;
  no UI asks for it yet.
