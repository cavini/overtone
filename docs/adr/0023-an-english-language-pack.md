# 0023 · An English language pack for the analysis

**Status** accepted
**Date** 2026-10-10
**Finishes** [0022](0022-the-language-is-chosen-per-episode.md), which left this open
**Supersedes** [0014](0014-brazilian-portuguese-analysis-pipeline.md)'s "multi-language is out of scope, not deferred"

## Context

ADR 0022 made the language a property of the episode and said plainly what it
had not done: everything after the transcript was still Brazilian Portuguese
and hardcoded. An episode transcribed as English came back as a correct
English transcript and was then counted with Portuguese stop words, so `the`,
`and` and `of` would have been reported as the most-said words of the episode.

Every number below was measured against the real archive — ten episodes,
6,952 segments — rather than reasoned about. Several of them contradicted the
reasoning, which is the only reason this ADR says what it says.

## Decision

### A language pack, not a language flag

Everything language-dependent lives in one object per language: stop words,
fillers, colloquial overrides, the rule for splitting a written-together
word, the out-of-dictionary stemmer, and the Postgres text-search
configuration. `languagePack(language)` returns it, and the analysis
functions — `classify`, `tokenise`, `annotate` — take the language as a
required argument.

Required, not defaulted. A default of `'pt'` is how an English episode gets
analysed as Portuguese and reported as if it were right.

The map is typed `Record<AudioLanguage, LanguagePack>`, so offering a third
language for transcription without writing its pack is a **compile error**
rather than a silently Portuguese result. That is the one thing a flag
threaded through six functions cannot give you.

### Two stop-word lists, never one union

The overlap between the languages is real and asymmetric. `a`, `e`, `me`,
`no`, `do` and `as` are function words in both — but `era`, `tem`, `sem` and
`for` are a Portuguese stop word and an English noun or verb. A merged list
would suppress a word in whichever language it meant something in, and
suppress it invisibly: the token is still stored and still counted, it simply
never appears in the view anyone looks at.

### The English stemmer does plurals, and refuses everything else

The same restraint the Portuguese stemmer shows, for the same reason. No
`-ing`, no `-ed`: that folds `running` to `runn` and merges `interested` with
`interest`. Verb morphology is the dictionary's job, and the published list
already maps `run` to `ran`, `running` and `runs`.

Three decisions inside it are worth recording, because the obvious choice is
wrong in each:

- **`-ss`, `-us` and `-is` are rules, not list entries.** Between them they
  guard `class`, `virus`, `campus`, `basis`, `crisis` and `analysis` without
  enumerating any of them. What is left to list is a short residue —
  `series` and `species` end in `-ies`, `physics` in `-cs`.
- **`-ies` drops only the `s`.** The textbook rule is `-ies` → `-y`, and it
  is wrong *here*: this function only ever runs on words the dictionary does
  not hold, and the published list holds `stories`, `movies`, `cities`,
  `knives`, `houses`, `buses`, `caches` and `prizes` — every ambiguous case
  we could think to check. What actually reaches the fallback is new
  vocabulary: `selfies`, `hoodies`, `newbies`, `foodies`, which are `-ie`
  plus `s` almost without exception. `-y` would make `selfies` into `selfy`.
- **A stop word is never stemmed.** The English list holds inflected
  auxiliaries ending in `s`, and `does` would otherwise reduce to `doe` —
  which is not a stop word, so an auxiliary the default view hides would
  reappear as a visible term. The Portuguese stemmer needs no such guard,
  because every plural stop word it can reach reduces to another stop word.

### Contractions split; contracted negatives do not

`it's` is two words written as one, exactly as `diga-me` is. Left joined,
`it's`, `that's` and `there's` arrive as three separate countable terms and
crowd out everything real, because nothing on the stop-word list matches them
in that shape.

So a trailing `'s`, `'ve`, `'ll`, `'re`, `'d` or `'m` is peeled off — in
either spelling of the apostrophe, because Whisper writes U+2019 about as
often as U+0027 and NFC does not fold one into the other. `n't` is left
attached and the whole form is a stop word instead: `can't` and `won't`
contract irregularly, so peeling the suffix leaves `ca` and `wo`.

### The dictionary gets a second half, keyed by language

`lemmas` was keyed on `form` alone, which was right for one language and
breaks for two. **760 spellings sit in both halves with different lemmas** —
`aches` is `achar` ("to find") in Portuguese and `ache` in English, `admires`
is `admirar` and `admire`, `agenda` is `agendar` and `agendum`. Under the old
key whichever half loaded second would have overwritten the other and every
one of those words would have been grouped under the wrong language, with
nothing to show it had happened. The key is now `(language, form)`, every
lookup is scoped, and the loader deletes only the language it is about to
load rather than truncating.

Identity-row pruning is done with **that language's own stemmer**. ADR 0019's
rule is "drop an identity row only when the stemmer independently agrees",
and agreement is meaningless if it is the wrong stemmer agreeing: judged by
the Portuguese rules the English list needs 747 protective rows, judged by
the English ones it needs 21.

### Search reads both configurations, for every reader

Postgres ships `portuguese` and `english`, and the archive is indexed under
both — two GIN expression indexes, OR-ed in one query.

**Both are needed, and not for the reason expected.** The obvious half is
that `portuguese` is the only one that knows Portuguese verb morphology and
Portuguese stop words. The less obvious half, which is why this is not just a
loanword feature:

| query | through `portuguese` | through both | why |
|---|---|---|---|
| `podcasts` | **0** of 10 | 10 | pt leaves `podcasts` as `podcasts`; en reduces both to `podcast` |
| `ano` | 62 | 195 | pt leaves `anos` as `anos`; en strips the plural |
| `dia` | 85 | 131 | same |
| `bet` | 112 | 145 | same, for `bets` |
| `posts`, `prints`, `players`, `jobs`, `tests` | **0** each | 9, 3, 2, 3, 3 | same |

The `ano` row is the one that changes the story. Portuguese Snowball only
strips a suffix inside the word's RV region, and a short word has none — so
`anos`, `dias`, `pais` and `bets` keep their plural `s`, and a search for
`ano` was missing 133 segments that say `anos`. **The English configuration
improves Portuguese recall.** This is not a bilingual nicety bolted on for
English readers; it fixes the Portuguese path.

Against the archive's own 300 most-said terms, the English half contributes
nothing at all for 292 of them, and where it contributes the extra rows are
genuinely the word asked for.

#### The gate, which is not optional

A stop-word list is the one part of a text-search configuration that can turn
a question into the whole archive. `que` parses to nothing in Portuguese and
to a lexeme in English, where it sits in **2,172 of 6,952 segments**. `não`
is 1,544. `ele` is 931. `isso` is 496.

So: **a query that *any* configuration reduces to nothing is not asked at
all.** Symmetric, deliberately — `the` is a content word to the Portuguese
configuration, so on an English episode it would match every segment. The
rule costs only words that are a stop word in one language and a content word
in the other, of which `era` is about the only real example.

#### Why not one configuration, or one index

- **A merged configuration cannot exist.** The natural idea is a custom
  configuration mapping each token type to `portuguese_stem, english_stem`.
  It was built and measured: the output is byte-identical to `portuguese`
  alone, and it does not find `deploy` in "os deploys". A Snowball dictionary
  always recognises its input, so it terminates the chain and the second
  stemmer is never reached.
- **Not one concatenated `tsvector`.** `to_tsvector('portuguese', text) ||
  to_tsvector('english', text)` would be one column and one index, and `||`
  shifts the right operand's positions — which breaks phrase search and
  doubles the document length that ranking divides by. Two indexes keep each
  half's positions intact, and Postgres combines them itself: the plan is a
  `BitmapOr` over two `Bitmap Index Scan`s with no sequential scan, which is
  asserted in a live test.

#### The reader's language is not an input

The `TranscriptSearch` port takes a query and a limit. It has no locale
parameter and does not acquire one. Both configurations are consulted for
every reader, so two people searching the same word in different interfaces
get the same rows in the same order. ADR 0022 kept the invariant for counts
by putting the language on the episode; this keeps it for search by refusing
the input.

### Accents stay

Neither configuration strips diacritics, and `unaccent` is **not installed
and must not be**: it would fold `e`/`é` and `por`/`pôr`, which is the one
thing ADR 0014 calls a hard rule. Measured: `to_tsvector('portuguese', 'e é')`
keeps `é` and drops `e` as a stop word, and the two never merge. As a happy
accident the Portuguese stemmer already reduces both `cafe` and `café` to
`caf`, so the common missing-accent typo is forgiving on that side without
anyone breaking the rule to make it so.

## Consequences

- `PIPELINE_VERSION` → 2 and `VOCABULARY_VERSION` → 3. Portuguese numbers are
  unchanged — the whole existing suite passes untouched — and that is not a
  reason to leave them alone: version 1 described one pipeline and version 2
  describes two, and a Portuguese episode and an English one both claiming
  version 1 would make the field meaningless exactly where it matters.
- Storage. The English GIN index is 888 kB against the Portuguese one's
  616 kB for ten episodes, so roughly 4 MB at the 45-episode ceiling. The
  dictionary is the real cost: `lemmas` is now **83 MB** including indexes,
  against ADR 0019's estimate of 25 MB, on a 500 MB tier. Worth watching, not
  worth acting on yet.
- Searching a Portuguese stop word returns nothing, as it did before. That is
  unchanged behaviour, now load-bearing rather than incidental.
- **The English dictionary must not be loaded before this is on `main`.** The
  migration is safe to apply early — the column defaults to `pt`, so every
  existing row keeps the truth about itself — but the deployed `lemmaQuery`
  has no language filter and collapses duplicate forms with last-row-wins.
  With both halves present it would resolve those 760 spellings to whichever
  language the database happened to return last. The data is loaded by a
  script rather than a migration, which is what makes the ordering a choice;
  the live tests that need it skip until it is there.
- A query is never language-detected. Two words carry far too little signal,
  and detection is the thing ADR 0014 refuses for audio for the same reason.

## What is good, and what is thin

Being specific about this is the point of writing it down.

**Good.** The stop-word and filler lists are ordinary work and are as sound
as the Portuguese ones. Contraction splitting is a real fix, not a stub. The
dictionary's irregular coverage is the part no stemmer can ever reach and it
is genuinely there: `was`→`be`, `went`→`go`, `children`→`child`,
`mice`→`mouse`, `better`→`good`, `worse`→`bad`.

**Thin, and known.**

- The English dictionary is **41,480 pairs over 25,863 lemmas**, against
  824,978 Portuguese pairs. English inflects far less so the ratio overstates
  it, but 18,000 of those lemmas carry a single form — usually just the
  plural, which the stemmer would have grouped anyway. The dictionary's
  unique contribution is about 19,000 non-plural inflections.
- It holds **nothing modern**. `podcast` is absent entirely, so the
  vocabulary an English episode of this show would actually be full of falls
  straight through to the stemmer.
- **`people` is missing** as a form of `person`. A conspicuous gap in a list
  whose whole value is irregulars.
- It is corpus-derived and carries dialect and junk: `think`→`thinked`, and
  `'s` filed under both `be` and `have` with the winner decided by line
  order.
- **No colloquial overrides.** The Portuguese list has twelve, every one
  found in a real episode — `cara` was the most-said word of a two-hour
  recording and the dictionary called it "expensive". There is no English
  episode to learn from, and inventing corrections for a register nobody has
  recorded would be guessing where the Portuguese list is evidence. This will
  need a pass after the first real English episode.
- **A Portuguese-inflected loanword is reachable by neither stemmer.**
  `hypado` stems to `hypad` in Portuguese and stays `hypado` in English,
  while `hype` is `hype` in both, so a search for one never finds the other.
  The product answer is the watchlist alias mechanism (ADRs 0006, 0014), not
  a third configuration.
- **Only Portuguese has ever been run end to end on real audio.** The English
  pack is tested, and it is tested against constructed text and against
  Portuguese episodes that happen to contain English words. No English
  episode exists yet. The cheapest next experiment is the same one ADR 0014
  prescribed for Portuguese: transcribe ten minutes of English audio and
  hand-check the top terms.
