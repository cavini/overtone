# ADR 0019 — The lemma dictionary, and the licence it brings with it

**Date:** 2026-10-08 · **Status:** accepted · **Settles:** the open item in ADR 0014

## Context

A Portuguese verb has roughly fifty inflected forms. Without a dictionary, `falar`, `falei`, `falando` and `falou` are four separate terms, and the most-said list fragments into conjugations instead of showing what the show actually talks about. The stemmer already in place handles plurals — `guardachuvas` → `guardachuva` — and deliberately refuses to guess at conjugation, because a general-purpose Portuguese stemmer folds `comer` into `com` and promotes a preposition to the top of the frequency list.

So a form→lemma dictionary is the missing piece. Three ways to get one:

| | Coverage | Licence | Cost |
|---|---|---|---|
| `michmech/lemmatization-lists` (pt) | 850 264 pairs | **ODbL** | none |
| Generate from conjugation rules | common verbs only | ours | days of work, and a long tail of irregulars |
| Stemmer only | plurals, no verbs | none | nothing, but the feature is missing |

## Decision

Use the published list: **850 264 Portuguese form/lemma pairs from `michmech/lemmatization-lists`, under the Open Database License**, derived upstream from OpenOffice Hunspell dictionaries.

### What the licence actually obliges

- **Attribution** — the source must be credited where a user can find it.
- **Share-alike on the data** — if we publish a modified version of the database, that version stays under ODbL.
- **Commercial use is permitted.** ODbL does not restrict it.
- **It does not touch our own code.** ODbL governs the database, not software that queries it. The application's licence is unaffected, which is the distinction worth being precise about.

The practical cost is a credit line and a commitment to keep the word list open. For this project neither is a constraint.

### How it is stored

A static `lemmas(form, lemma)` table, shared by every user, loaded by a migration. Roughly 25 MB against a 500 MB tier.

It is **not** bundled into the application. The analysis takes the dictionary as an argument, so a use case performs **one bulk query** for the few thousand distinct forms in an episode and passes a plain map down (ADRs 0014, 0016). That is what lets a dictionary-backed lemmatiser coexist with an analysis layer that does no I/O.

### Pruning, and the trap in it

An identity row — a form that is its own lemma — looks redundant, since a lookup miss falls through to the stemmer, which usually returns the word unchanged. Dropping all of them would be wrong.

`país` is its own lemma. The stemmer, seeing a word ending in `s`, would reduce it to `paí`. The dictionary entry is the only thing stopping that.

So the rule is: **drop an identity row only when the stemmer independently agrees.** Provably safe, and it removes most of them.

## Consequences

- Verb grouping works, and `casa` (house) stays separate from `casar` (to marry) — which no stemmer can do.
- The stemmer remains the fallback, and it earns its place: a podcast is full of names, slang, in-jokes and English borrowings that no dictionary holds. Those still group by plural, flagged as heuristic so the UI can say the grouping was a guess.
- We owe an attribution notice. Tracked in `ATTRIBUTION.md` and required in the app before anything is shared publicly.
- The dictionary is data, not code, and is fetched by a setup script rather than committed. A 25 MB text file does not belong in git history.
- **Reversal cost is low.** The dictionary enters through a port, so replacing it with a hand-built list later means loading a different table — no code changes. That keeps the licence decision cheap to unmake if it ever becomes inconvenient.
