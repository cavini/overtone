# ADR 0014 — Brazilian Portuguese is the language; replace the analysis library

**Date:** 2026-10-08 · **Status:** accepted, **superseded in part by** [ADR 0022](0022-the-language-is-chosen-per-episode.md) — the language is now chosen per episode. What this ADR got right survives: an episode records what it was transcribed as, so switching the interface cannot move an existing count. · **Supersedes:** the `wink-nlp` choice in ADR/tech-stack · **Resolves:** the language question

## Context

The show is recorded in **Brazilian Portuguese**. Every prior doc assumed English-only.

This is not a locale setting. `wink-nlp` was chosen specifically because it bundles an English lemmatiser, POS tagger and stop-word list in-process with no native dependencies. **None of that exists for Portuguese.** The library stays useful for nothing we need, so it goes.

Worse, Portuguese makes the analysis *harder* in exactly the places this product is sensitive:

| Problem | Why it bites a counting product |
|---|---|
| **Diacritics are semantic** | `e`/`é` (and / is), `por`/`pôr` (by / to put), `esta`/`está` (this / is), `as`/`às`. Stripping accents — the reflex in English pipelines — silently merges unrelated words. |
| **Verbs have ~50 inflected forms** | `falar, falo, falas, falei, falava, falaria, falando, falado…` all one lemma. Grouping is now essential, not a nicety. |
| **Enclitic pronouns attach with hyphens** | `diga-me`, `fazê-lo`, `dá-se`. The English rule "keep intra-word hyphens" is wrong here — but `guarda-chuva` and `segunda-feira` are genuine compounds that must stay whole. |
| **Stemmers over-merge** | Portuguese Snowball maps `casa` (house) and `casar` (to marry) both to `cas`; `comer` (to eat) stems to `com`, colliding with the preposition `com` (with). A false merge inflates a count **invisibly**. |
| **Whisper emits written-standard Portuguese** | Casual `pra`, `tá`, `né`, `cê` may be transcribed as `para`, `está`, `não é`, `você`. A term's count can depend on the transcriber's orthographic choices. |
| **Code-switching is normal** | Brazilian podcasts drop English tech and meme vocabulary constantly. |

## Decision

A pt-BR pipeline, deterministic end to end:

1. **Transcribe with `language: "pt"` set explicitly.** Never auto-detect — detection misfires on accented and code-switched speech, and an episode silently transcribed as Spanish would produce confident nonsense.
2. **Normalise:** Unicode **NFC**, lowercase, strip only leading/trailing punctuation. **Diacritics are preserved.** This is a hard rule with a test, not a preference.
3. **Tokenise with clitic splitting.** A trailing hyphen + a known enclitic pronoun (`me, te, se, lhe, lho, nos, vos, lo, la, los, las, no, na`) splits; everything else keeps its hyphen. Compounds survive, clitics don't.
4. **Lemmatise by dictionary first, stem only as fallback.** An open form→lemma list for pt-BR loaded into a `lemmas(form, lemma, pos)` table. Out-of-dictionary tokens — names, slang, in-jokes, English loanwords, exactly the vocabulary a podcast is full of — fall back to a Portuguese Snowball stemmer, and are **marked as stemmed** so the UI can show the grouping was heuristic.
5. **pt-BR stop-word list**, versioned alongside the normalisation version.

### Dictionary-first, and why it is worth the table

A stemmer alone is cheaper and wrong in the one way we cannot tolerate: `comer` → `com` would fold a common verb into a preposition and inflate a stop word into the top terms. A dictionary lookup is exact for known vocabulary and explainable when asked.

The lookup must not break `packages/core`'s no-I/O rule. So it doesn't: core's `annotate()` takes a **`LemmaLookup` map as a parameter** and stays a pure function. The caller performs **one bulk query per episode** — `select form, lemma from lemmas where form = any($1)` over the ~3–5k distinct forms in that episode — and passes the result in. One indexed query, no megabytes bundled into the function, dictionary versioned in a migration, purity intact.

### The orthography problem gets a product answer, not a technical one

We cannot stop Whisper normalising `pra` to `para`. What we can do is make a running joke's watchlist carry **both spoken and written variants as aliases** — which the watchlist design (ADR 0006) already supports, because a topic was always a *set* of patterns rather than one string. The gendered and plural variants that Portuguese adds (`o hotdog`/`os hotdogs`, `bonito/bonita/bonitos/bonitas`) ride the same mechanism.

This is the second time the watchlist decision has absorbed a problem it wasn't designed for.

## Consequences

- **`wink-nlp` is removed from the stack.** Replaced by: NFC normalisation, a clitic-aware tokeniser, the `lemmas` table, a Snowball pt stemmer, and a pt-BR stop-word list. More of the pipeline is now ours to write and test — a real cost, measured in days.
- **Still deterministic, still pure, still TypeScript.** No Python, no native build (ADR 0002 holds again). The whole suite stays offline and fast.
- **Over-merges are visible rather than silent.** Domain decision D4 already stores surface, normalised and lemma, and the UI already shows which surface forms merged into a term. So when the stemmer folds `casa` into `casar`, the user sees it and can fix it with an alias — the trust design doing work it wasn't built for.
- **Accuracy expectations drop.** pt-BR word error rates are higher than English, and proper nouns, slang and in-jokes are the worst case — which is a problem, because in-jokes *are* the product. This becomes the single most severe risk on the register, and the cheapest experiment in the whole plan is now: transcribe ten minutes of a real episode with `language=pt` and hand-check recall on a list of in-joke terms. One evening, free, and it tells us whether the product works at all.
- The `lemmas` table is static, shared by every user, and perhaps 10–25 MB against a 500 MB tier. ⚠️ The licence of whichever form→lemma list we adopt must be checked before it ships.
- **Multi-language is out of scope, not deferred.** Every rule above is language-specific. Supporting a second language means a second pipeline, and that is a different product decision.
