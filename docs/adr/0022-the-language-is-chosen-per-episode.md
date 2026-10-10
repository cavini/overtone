# 0022 · The language is chosen per episode

**Status** accepted
**Date** 2026-10-10
**Supersedes** [0014](0014-brazilian-portuguese-analysis-pipeline.md), in part

## Context

ADR 0014 fixed every episode at Brazilian Portuguese and forbade the
interface language from influencing the pipeline. The reasoning was sound:
if switching to English changed the numbers, no number could be trusted, and
a reader comparing two episodes would have no idea whether a difference was
real. There is a test for it.

The decision conflated two different things, and the stakeholder has now
asked for the one it got wrong.

- **A finished episode's counts must never move.** Still true. Somebody
  reading in English is reading the same episode, and it must say the same
  thing.
- **The language can never be chosen.** Not true. A recording in English is
  a *different episode*, not a re-reading of an existing one. Refusing to
  transcribe it at all is not neutrality; it is a missing feature.

## Decision

**The language is a property of the episode, settled when it is uploaded and
never revisited.**

- The interface language chooses what the *next* episode is transcribed and
  analysed as.
- `episodes.language` records it. Existing rows default to `pt`, which is
  the truth about them.
- `advanceEpisode` reads the episode's own language. It never reads the
  reader's.
- The switcher says so. A language picker normally changes only what you
  read, so the consequence is stated plainly on the page you land on rather
  than hidden in a tooltip.

What ADR 0014 got right is kept intact by the storage: because the language
lives on the episode, switching the interface cannot retell what an existing
episode was transcribed as. The invariant survives; only the constant is
gone.

## The part that is not finished

**Transcription is language-aware. The analysis is not yet.**

Everything after the transcript is still Brazilian Portuguese and hardcoded:
279 Portuguese stop words, 12 Portuguese fillers, a Portuguese stemmer,
enclitic splitting (`diga-me`), the pt-BR colloquial overrides, and a lemma
dictionary holding only the Portuguese half of the upstream dataset.

So an episode transcribed as English today would come back as a correct
English transcript and then be counted with Portuguese stop words — meaning
`the`, `and` and `of` would be reported as the most-said words of the
episode. That is worse than refusing, and it is being fixed separately; this
ADR records the plumbing, not a finished feature.

Until the English language pack lands, English is reachable and its counts
are not to be trusted.

## Consequences

- The test asserting counts are identical with the interface in English
  still holds for any *existing* episode, and that is the version worth
  keeping. A new episode uploaded while the interface is in English is a
  different episode and is expected to differ.
- `TranscriptionRequest.language` widens from the literal `'pt'` to a union.
  Auto-detection is still refused: detection misfires on accented and
  code-switched speech, and an episode silently transcribed as the wrong
  language produces fluent nonsense that still counts.
- The audio language and the interface language are now coupled at exactly
  one moment — upload — and nowhere else.
