# Overtone — Glossary & Domain Model

These nouns become tables, API resources, and test fixture names. One word, one meaning, everywhere. Where a term is ambiguous, a **Decision** is recorded with rationale; unresolved ones carry ⚠️ NEEDS CONFIRMATION.

---

## 1. Core nouns

| Noun | Definition | Identity / cardinality | Not to be confused with |
|---|---|---|---|
| **Recording** | One uploaded audio artifact plus its metadata (title, source filename, duration, byte size, content hash, upload time, language, processing status). The unit a user uploads, deletes, and names. | Owned by exactly one Library. 1 Recording → 0..1 Transcript. | The audio *file*, which is a storage blob the Recording points at. A Recording can outlive its audio (see Decision D12). |
| **Transcript** | The complete, ordered textual rendering of one Recording produced by one ASR run, with a model identifier, a produced-at timestamp, and a quality score. Immutable once written. | 1 per completed ASR run. A re-transcription creates a **new** Transcript; the old one is superseded, not mutated. | Analysis. A Transcript holds words, never counts. |
| **Segment** | A contiguous, timestamped span of one Transcript as emitted by the ASR engine, with `start_ms`, `end_ms`, text, and mean confidence. The atomic unit of *retrieval* and the thing a timestamp link points at. | 1 Transcript → many Segments, non-overlapping, ordered. Typically 2–30 s. | Utterance. Segments are machine-chosen chunks; they may split or merge sentences. |
| **Utterance** | A contiguous run of Segments attributed to a single Speaker — one speaker's turn. The boundary that matters semantically. | 1 Transcript → many Utterances. With no diarization, a Transcript is exactly one Utterance by `speaker_unknown`. | Segment. Utterance boundaries are *speaker* changes; Segment boundaries are *acoustic/length* changes. |
| **Speaker** | A distinct voice within one Recording, identified as a label (`Speaker 1`), optionally renamed by the user (`Maya`). Scoped to one Recording. | 1 Recording → 1..n Speakers. | A Overtone user account. Cross-recording speaker identity (voiceprints) is explicitly out of scope. |
| **Token** | One occurrence of one lexical item at one position in one Transcript: `{recording_id, transcript_id, segment_id, utterance_id, speaker_id, position, start_ms, surface, normalized, lemma}`. The grain of all counting. | Many per Segment. Punctuation and whitespace are **not** Tokens. | Word (the type). A Token is an instance; a Word/Term is a type. |
| **Term** | A countable lexical *type* the system can count: a single word or a multi-word phrase, defined by a canonical form plus an alias set (surface variants that count as the same thing). | Global dictionary of canonical terms; aliases resolve to one Term. | Token (instance) and Topic (bundle of Terms). |
| **Topic** | A **named, user-defined bundle of Terms** representing something the user cares about, e.g. Topic `flaky tests` = Terms `flaky`, `flake`, `flaky test`, `test flake`. Scoped to a Library, applies to all Recordings in it. | 1 Library → 0..n Topics; 1 Topic → 1..n Terms. | Keyword. A keyword is a bare string; a Topic is a stable, named, aliased, auditable concept. See Decision D7. |
| **Analysis** | One computed result set over one Recording for one configuration (stop-word list version, topic set version, normalization version), with the config recorded. Re-runnable and reproducible. | 1 Recording → 1..n Analyses; the newest is the default view. | Transcript. Analysis is derived and disposable; Transcript is expensive and retained. |
| **Insight** | A single presentable finding produced by an Analysis: a count, a rate, a rank, or a trend — always carrying its provenance (which Tokens produced it). | Many per Analysis. | Analysis (the container). |
| **Library** | The complete set of Recordings, Topics, Analyses, and Queries belonging to one owner. The scope over which "ever" questions are answered, and the tenancy boundary. | 1 per user account in MVP. | An account. (Shared/team Libraries are a `Later` concept.) |
| **Query** | A structured, stored specification of a question over a Library: `{terms|topics, recording filter, date range, speaker filter, group_by, metric}`. Executed by one shared count engine. | 0..n per Library; may be ad-hoc or saved. | A UI filter state. Query is a first-class domain object precisely so the future assistant compiles natural language *into* it rather than around it. |

### Relationship sketch (words, not schema)

> A **Library** holds many **Recordings**. A Recording yields one current **Transcript**, which is an ordered list of **Segments**, grouped into **Utterances** each attributed to a **Speaker**, and tokenised into **Tokens**. Each Token resolves to a **Term**. A **Topic** names a set of Terms. An **Analysis** counts Tokens by Term/Topic under a stated configuration and emits **Insights**. A **Query** selects and aggregates Tokens across the whole Library and is the single execution path for both the dashboard and the future assistant.

---

## 2. Decisions: what exactly counts as "a word was said"

**D1 — A count is a count of Tokens, as transcribed.**
"The word *deploy* was said 23 times" means: 23 Tokens in the current Transcript of this Recording resolve to the Term `deploy`. Repeats always count (saying it twice in one sentence is two). *Rationale:* the only definition that is deterministic, testable, and explainable. **Consequence:** counts describe the transcript, not reality — so the UI must say "as transcribed" and every count must drill to quotes (see D10).

**D2 — Normalization pipeline (fixed order, versioned).**
1. Unicode NFKC. 2. Lowercase. 3. Strip leading/trailing punctuation. 4. Keep *intra-word* apostrophes (`don't`, `o'clock`) and hyphens (`end-to-end`). 5. Strip filler artifacts the ASR emits as words (`uh`, `um`) into a separate filler class rather than the word index. 6. Numbers kept as written by the ASR (`"24"` and `"twenty four"` are different Tokens). *Rationale:* case and trailing punctuation are never semantically interesting; intra-word marks are. The version string is stored on every Analysis so counts are reproducible.
⚠️ NEEDS CONFIRMATION — *Should `"24"` and `"twenty four"` be unified?* Recommendation: **no for MVP** (it is a deep rabbit hole), revisit if users complain.

**D3 — Contractions are counted as one Token, and matched by expansion.**
`don't` is **one** Token with surface `don't`. For *Term matching*, its expansion `do not` is in the Term's alias set, so a Topic containing `do not` matches `don't`. *Rationale:* word-frequency lists should show what was actually said; topic matching should be forgiving. These are two different jobs and must not share one rule.

**D4 — Lemmatisation: group for display, store ungrouped.**
Tokens store `surface`, `normalized`, and `lemma`. The default word-frequency view is **lemma-grouped** — `run` (14) expandable to `run 6 / running 5 / ran 3`. *Rationale:* Maya asks "how often did we talk about running X", not "how often did the string 'running' occur". Storing all three keeps the ungrouped view a pure display toggle, costs nothing, and keeps the researcher persona (P2) reachable later.
⚠️ NEEDS CONFIRMATION — *Is lemma-grouped the right default, or should the default be literal surface counts?* Recommendation: **lemma-grouped default, with a visible "exact words" toggle.**

**D5 — Stop words are filtered from *display*, never from *storage*.**
Every Token is indexed. A versioned English stop-word list (~180 items: articles, pronouns, auxiliaries, discourse markers) is excluded from the default top-N view and from "suggested topics". A user can switch the filter off, and a stop word used as an explicit Term in a Topic is **always** counted. *Rationale:* `the` must never be the headline insight, but `can` might matter in `can of worms`; destroying data at index time makes that unfixable.

**D6 — Multi-word Terms are matched on the normalized Token stream, space- and hyphen-insensitive.**
`hot dog`, `hotdog`, and `hot-dog` collapse to the same match key by removing internal separators from the candidate n-gram before comparison. So one Term `hotdog` with that key matches all three spellings, and `hotdogs` matches via the lemma from D4. *Rationale:* users think in concepts, not orthography; this is the literal stakeholder example and must be correct on day one.

**D7 — A Topic is user-defined in MVP. Machine-discovered clustering is `Later`. (Opinionated position.)**
A **keyword** is a string. A **Topic** is a named, versioned bundle of Terms with aliases. Arguments for user-defined:
- **Auditable.** The user can see exactly which words produce the count. An embedding cluster cannot be explained to someone who distrusts the number — and J1 step 6 proves distrust is the default state.
- **Stable across recordings.** The `ever` query requires that "the hotdog topic" means the same thing in May and September. Per-recording clustering is not stable; cluster 3 in one recording is not cluster 3 in another.
- **Testable.** A watchlist yields exact expected counts in a fixture, so acceptance criteria are falsifiable. "The clustering found a reasonable topic" is not a test.
- **Cheap.** No model, no tuning, no eval harness in the MVP.
The real cost is the blank-page problem: users don't know what to watch. **Mitigation (in MVP):** seed suggestions from the recording's own top non-stop-word lemmas (one-click "track this"). That delivers most of the discovery value with none of the clustering machinery. Machine-discovered topics return later as *Suggested Topics* — proposals a user promotes into real Topics, never as the counted unit itself.

**D8 — Phrase matching may cross a sentence boundary, never a Speaker turn.**
Matching runs over the Token stream of one **Utterance**, ignoring sentence-ending punctuation, with **zero intervening tokens** allowed (exact adjacency after normalization) for MVP. So "…we shipped the hot. Dog ate it" would match `hot dog` — accepted as a rare false positive — while A saying "hot" and B saying "dog" never matches. *Rationale:* ASR punctuation is unreliable enough that respecting sentence boundaries would cause more false negatives than the false positives it prevents; speaker turns are semantically real and must be respected.
⚠️ NEEDS CONFIRMATION — *Allow slop (e.g. `hot [steamed] dog`)?* Recommendation: **no for MVP** — adjacency-only is deterministic and easy to test; slop needs a tuned window and an eval set.

**D9 — Mishearings are counted as what the ASR heard, and the discrepancy is surfaced, not hidden.**
If "hot dog" is transcribed "hotdoc", it is **not** counted. Overtone makes three guarantees instead of pretending to fix it: (a) every count links to its quotes so false positives are visible; (b) a Transcript-level quality score (mean ASR confidence, 0–100) with a **"poor" warning below 70** tells the user when counts are untrustworthy; (c) phonetic/fuzzy matching is a named `Later` capability, shipped only with a measured precision/recall baseline. *Rationale:* fuzzy matching without an eval set trades invisible false negatives for invisible false positives — strictly worse, because the user can no longer verify anything.

**D10 — Provenance is part of the definition of a count.**
An Insight that cannot enumerate the Tokens behind it is not a valid Insight and must not be rendered. *Rationale:* this single rule is what makes D1, D8 and D9 tolerable, and it is the acceptance-critical property in J1 step 6 and J5 step 2.

**D11 — One count engine, two front-ends.**
All counting — dashboard, export, and the future assistant — executes the same **Query** object through the same engine. The assistant's only job is natural language → Query, plus prose over retrieved Segments; it never computes a number itself. *Rationale:* the alternative guarantees that the chatbot and the dashboard eventually disagree, which is unrecoverable (J5 step 2).

**D12 — A Recording's audio may be purged while the Recording and Transcript survive.**
Deleting *audio* (retention/privacy) and deleting *a Recording* (removing it from the Library) are different operations with different UI. A Recording whose audio is purged keeps its counts but loses playback. *Rationale:* lets privacy-sensitive users analyse material they would never store, without destroying the Library's analytic value.
⚠️ NEEDS CONFIRMATION — *Should MVP retain source audio indefinitely by default, or purge it N days after processing?* Recommendation: **retain by default** (playback is load-bearing for trust in J1 step 7), with an explicit per-recording purge action and a stated retention policy.

---

## 3. Vocabulary hygiene rules

| Rule | Reason |
|---|---|
| Never say "file" in the UI where a **Recording** is meant | A Recording survives its file (D12) |
| Never say "keyword" in UI or code | It is either a **Term** or a **Topic** (D7) |
| Never render a count without its drill-down affordance | D10 |
| Never say "accurate"; say **"as transcribed"** | D1/D9 — the product cannot claim ground truth |
| `word count` = total Tokens; `unique words` = distinct Terms; never interchange | Two different numbers users read off the same screen |
| Statuses are exactly: `uploaded`, `transcribing`, `analyzing`, `ready`, `failed`, `deleting` | Tests assert on these strings |
