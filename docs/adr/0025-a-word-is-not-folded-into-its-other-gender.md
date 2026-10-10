# 0025 · A word is not folded into its other gender

**Status** accepted
**Date** 2026-10-10
**Refines** the lemma policy in [0014](0014-ptbr-text-pipeline-in-process.md)

## Context

The group noticed the grouping was wrong: *filho* and *filha* are similar but
not the same, and the page was treating them as one word.

They are right, and it is worse than it looks. The bundled ODbL list is
**mechanically generated**, and it does two separate wrong things:

1. **It folds the feminine onto the masculine.** `menina` → `menino`,
   `música` → `músico`, `política` → `político`, `irmã` → `irmão`. That is the
   conventional *citation* form and the wrong answer for this product, whose
   page answers "what did we say". Music is not a musician.

2. **It maps nouns onto invented verbs.** `gato` → `gatar`, `filho` →
   `filhar`, `amigo` → `amigar`, `resto` → `restar`. Measured: **30.7% of
   mentions** were labelled with a word nobody said. It is also internally
   inconsistent — `filhos` → `filho` but `filho` → `filhar`.

Paradigm size does not separate the real verbs from the invented ones: `filhar`
carries 60 inflected forms in the list and `falar` carries 59. The list cannot
be repaired from its own contents.

## Decision

Fix (1) now; (2) needs different data.

**A dictionary entry is rejected when it folds a word into its other gender,**
and the word then stands for itself rather than falling through to the
stemmer — which would give `menin`, not a word either, and a worse label than
the one that was actually said.

**What makes this safe is that a Portuguese infinitive always ends in `-r`.**
A lemma that does not end in `-r` cannot be a verb, so no amount of looking
like a vowel swap lets this rule touch `fala` → `falar` or `olha` → `olhar`.
Those are the groupings most worth keeping.

Two traps, both pinned by tests:

- `professor`/`professora` is a noun pair whose masculine *does* end in `-r`,
  so it is matched before the guard — narrowed to `-ora`, because the obvious
  "drop the final `a`" also describes the pluperfect: `falara` minus its `a`
  is exactly `falar`.
- Plurals are left alone. A plural folding into its singular is a collapse of
  number, and that one is wanted.

Measured on a real episode: **32 terms change, every verb form untouched.**

## What was measured and rejected

**"If the word is itself a citation form, keep it."** It would have fixed the
noun-to-verb class as well — `gato`, `resto`, `parte`, `governo`. It also
breaks `fala` → `falar`, `passa` → `passar`, `olha` → `olhar`, `deixa` →
`deixar`, because those stems are nouns too. Without a part of speech the
distinction is undecidable, and guessing wrong costs more than it gains.

## Consequences

- `PIPELINE_VERSION` → 3. Every count from before this is a different number.
- The noun-to-verb class (`filho` → `filhar`) is **still wrong**. Fixing it
  needs a dictionary carrying a part of speech — DELAF-PB/Unitex-PB or
  UniMorph `por` — which is a data change with a licence and a size question
  against the 500 MB tier, not a rule change. Until then `lemma_source`
  records which tier produced each answer, so the damage is at least
  interrogable.
