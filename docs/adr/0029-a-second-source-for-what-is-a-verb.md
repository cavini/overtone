# 0029 · A second source, for what is actually a verb

**Status** accepted
**Date** 2026-10-10
**Builds on** [0025](0025-a-word-is-not-folded-into-its-other-gender.md)

## Context

> *"I don't like how the grouping of words feels."*

ADR 0025 fixed half of it — the feminine being folded onto the masculine. It
also named the half it could not fix: the bundled list is **mechanically
generated** and maps plain nouns onto infinitives that barely exist.

| said | labelled |
|---|---|
| `gato` | `gatar` |
| `filho` | `filhar` |
| `bebê` | `beber` |
| `esperança` | `esperançar` |
| `bola` | `bolar` |

Measured: **a quarter of all mentions carried a label nobody had said.**

The list cannot be repaired from its own contents. `filhar` carries sixty
inflected forms and `falar` carries fifty-nine, so paradigm size separates
nothing, and the obvious rule — *"if the word is itself a citation form, keep
it"* — was measured and **rejected** in 0025 because it also breaks `fala` →
`falar`, `passa` → `passar`, `olha` → `olhar`.

## Decision

**Add a second source that contains only verbs**, and refuse a verb lemma for
a form that source has never heard of.

[UniMorph's Portuguese set](https://github.com/unimorph/por) (CC-BY-SA 3.0)
is 211,091 verb forms and **no nouns at all** — it has no entry for `gato`.
That absence is the signal. A lemma shaped like an infinitive, for a form
absent from it, is an invention.

Only the spellings are kept. Which tense a form is in answers a question
nothing here asks and triples the size of a table sitting on a 500 MB tier.
Loaded: **16 MB**, database at 119 MB.

Its own table, not a column on `lemmas`: a different source under a different
licence answering a different question, and joining them would lose track of
which said what.

### Measured on a real episode

Nineteen terms corrected — `certo`, `bebê`, `esperança`, `bola`, `quarto`,
`deputado` — and **every real verb form untouched**: `sabe` → `saber`,
`fala` → `falar`, `acho` → `achar`, `fui` → `ir`. Zero false positives.
Ghost labels fell from 28.0% to 25.1%.

### An empty list means a missing one

**The guard that matters.** Portuguese speech always contains verb forms, so
nothing matching across an episode's whole vocabulary means the table was
never loaded — not that the language has no verbs. Read the other way, the
rule rejects *every* verb lemma and silently destroys the grouping the
dictionary exists for.

It did exactly that in the integration suite the first time this ran, which
is the only reason it was noticed before shipping.

## What this still does not fix

`amigo` → `amigar`, `resto` → `restar`, `parte` → `partir`, `inteiro` →
`inteirar`. These **are** real verb forms — rare first-person presents of
real verbs — so UniMorph confirms them and the rule leaves them alone.
Telling "the rest" from "I remain" needs to know the word's part of speech
*in this sentence*, which is a tagger and not a dictionary.

The remaining 25% is mostly legitimate: `sabe` and `sei` showing as `saber`
is lemmatisation working.

## Consequences

- `PIPELINE_VERSION` → 5. Every count from before is a different number.
- Two new steps when setting up: `pnpm fetch:verb-forms` and
  `pnpm --filter @overtone/db db:load-verb-forms`. Skipping them is safe —
  the rule turns itself off rather than mangling anything.
- `LemmaRepository` grew `verbForms`, bulk and language-scoped like `lookup`.
