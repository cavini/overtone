# Overtone — Glossary & Domain Model

These nouns become tables, API resources, and test fixture names. One word, one meaning, everywhere. Where a term is ambiguous, a **Decision** is recorded with its rationale. All thirteen are settled.

---

## 1. Core nouns

| Noun | Definition | Identity / cardinality | Not to be confused with |
|---|---|---|---|
| **Series** | One show: a named, ordered collection of Episodes. The scope over which running-joke trends, leaderboards and "did we ever" questions are answered. | Owned by one Library. 1 Library → 0..n Series; 1 Series → 0..n Episodes. | A Library (which may hold several shows) and a season (a date range over one Series, not its own noun). |
| **Episode** | A Recording placed in a Series, carrying an **episode number** (unique within its Series) and a **recorded-on date**. In practice every upload becomes an Episode; `episode_id` and `recording_id` are the same identifier. | 1 Series → 0..n Episodes. 1 Episode → 1 Master, 0..6 Host Tracks, 1..n Chunks. | A file, and a Chunk. An Episode is one instalment of the show however many files it arrived as. |
| **Recording** | The generic upload: one audio artifact plus its metadata (title, source filename, duration, byte size, content hash, upload time, language, processing status). Becomes an **Episode** once it is in a Series. | Owned by exactly one Library. 1 Recording → 0..1 Transcript. | The audio *file*, which is a storage blob it points at. A Recording can outlive its audio (see Decision D12). |
| **Master** | The mixed-down audio of one Episode. **The only transcription input.** | 1 per Episode. | A Host Track. The Master produces words; Host Tracks produce attribution. |
| **Host Track** | One host's isolated recording of the same Episode, used **only as an energy signal** for Speaker attribution. Never transcribed, never a source of words. | 1 Episode → 0..6 Host Tracks. | The Master. Transcribing Host Tracks double-counts every sentence through mic bleed — see Decision D13. |
| **Chunk** | A contiguous slice of one Episode's Master, cut on a silence boundary, compressed and transcribed as one unit, carrying an `offset_ms` into the Episode. Our unit of upload, parallelism and retry. | 1 Episode → 1..n Chunks (a 2-hour episode is 5–6). | A Segment. A Chunk is chosen by us for mechanical reasons; a Segment is emitted by the ASR inside a Chunk. Chunk boundaries are invisible to counting (D8). |
| **Transcript** | The complete, ordered textual rendering of one Recording produced by one ASR run, with a model identifier, a produced-at timestamp, and a quality score. Immutable once written. | 1 per completed ASR run. A re-transcription creates a **new** Transcript; the old one is superseded, not mutated. | Analysis. A Transcript holds words, never counts. |
| **Segment** | A contiguous, timestamped span of one Transcript as emitted by the ASR engine, with `start_ms`, `end_ms`, text, and mean confidence. The atomic unit of *retrieval* and the thing a timestamp link points at. | 1 Transcript → many Segments, non-overlapping, ordered. Typically 2–30 s. | Utterance. Segments are machine-chosen chunks; they may split or merge sentences. |
| **Utterance** | A contiguous run of Segments attributed to a single Speaker — one speaker's turn. The boundary that matters semantically. | 1 Transcript → many Utterances. With no Host Tracks a Transcript is exactly one Utterance by `speaker_unknown`. | Segment. Utterance boundaries are *speaker* changes; Segment boundaries are *acoustic/length* changes. |
| **Speaker** | One host of one Episode, identified by their Host Track and optionally renamed (`Track 2` → `Mel`). Every word of the Master is attributed to exactly one Speaker or to `unknown` (D13). With no Host Tracks an Episode has one Speaker, `speaker_unknown`, and no breakdown is rendered. Scoped to one Episode. | 1 Episode → 1..7 Speakers (hosts plus `unknown`). | An Overtone user account. Cross-episode speaker identity (voiceprints) is explicitly out of scope. |
| **Token** | One occurrence of one lexical item at one position in one Transcript: `{episode_id, transcript_id, chunk_id, segment_id, utterance_id, speaker_id, position, start_ms, surface, normalized, lemma}`. `start_ms` is always **episode-relative** — chunk offsets are applied once, at stitching. The grain of all counting. | Many per Segment. Punctuation and whitespace are **not** Tokens. | Word (the type). A Token is an instance; a Word/Term is a type. |
| **Term** | A countable lexical *type* the system can count: a single word or a multi-word phrase, defined by a canonical form plus an alias set (surface variants that count as the same thing). | Global dictionary of canonical terms; aliases resolve to one Term. | Token (instance) and Topic (bundle of Terms). |
| **Topic** | A **named, user-defined bundle of Terms** — in this app, usually a **running joke**: Topic `the hotdog thing` = Terms `hotdog`, `hot dog`, `sausage`. Scoped to a Library, applied to every Episode in it, past and future. | 1 Library → 0..n Topics; 1 Topic → 1..n Terms. | Keyword. A keyword is a bare string; a Topic is a stable, named, aliased, auditable concept. See Decision D7. |
| **Analysis** | One computed result set over one Recording for one configuration (stop-word list version, topic set version, normalization version), with the config recorded. Re-runnable and reproducible. | 1 Recording → 1..n Analyses; the newest is the default view. | Transcript. Analysis is derived and disposable; Transcript is expensive and retained. |
| **Insight** | A single presentable finding produced by an Analysis: a count, a rate, a rank, or a trend — always carrying its provenance (which Tokens produced it). | Many per Analysis. | Analysis (the container). |
| **Library** | Everything one owner has: their Series, Episodes, Topics, Analyses and Queries. The tenancy boundary. **Every friend has their own Library**; they see each other's numbers through a Share Link, never through a shared Library. | 1 per user account. | A Series (a Library may hold several) and a team workspace (there isn't one). |
| **Query** | A structured specification of a question over a Series or Library: `{terms|topics, episode filter, date range, speaker filter, group_by, metric}`. Executed by one shared count engine for the Episode page, the Series leaderboard, the Share page and later the assistant. | 0..n per Library. | A UI filter state. Query is a first-class domain object precisely so the future assistant compiles natural language *into* it rather than around it. |
| **Share Link** | An unguessable, revocable URL granting anonymous read-only access to exactly one Episode's Insights and quotes. Grants no audio, no other Episode, no Series and no Library. | 0..1 per Episode. | A shared Library. A Share Link is the entire sharing model. |

### Relationship sketch (words, not schema)

> A **Library** holds **Series**; a Series holds numbered **Episodes**. An Episode has one **Master** (the only thing transcribed), 0..6 **Host Tracks** (energy signals for attribution), and is split into **Chunks** for upload and transcription. The Chunks' results stitch into one **Transcript** — an ordered list of **Segments**, grouped into **Utterances** each attributed to a **Speaker**, tokenised into **Tokens** with episode-relative timestamps. Each Token resolves to a **Term**; a **Topic** names a set of Terms. An **Analysis** counts Tokens by Term/Topic under a stated configuration and emits **Insights**. A **Query** aggregates Tokens across a Series and is the single execution path for the Episode page, the Series leaderboard, a **Share Link** page and the future assistant.

---

## 2. Decisions: what exactly counts as "a word was said"

**D1 — A count is a count of Tokens, as transcribed.**
"The word *deploy* was said 23 times" means: 23 Tokens in the current Transcript of this Recording resolve to the Term `deploy`. Repeats always count (saying it twice in one sentence is two). *Rationale:* the only definition that is deterministic, testable, and explainable. **Consequence:** counts describe the transcript, not reality — so the UI must say "as transcribed" and every count must drill to quotes (see D10).

**D2 — Normalization pipeline (fixed order, versioned).**
1. Unicode NFKC. 2. Lowercase. 3. Strip leading/trailing punctuation. 4. Keep *intra-word* apostrophes (`don't`, `o'clock`) and hyphens (`end-to-end`). 5. Strip filler artifacts the ASR emits as words (`uh`, `um`) into a separate filler class rather than the word index. 6. Numbers kept as written by the ASR (`"24"` and `"twenty four"` are different Tokens). *Rationale:* case and trailing punctuation are never semantically interesting; intra-word marks are. The version string is stored on every Analysis so counts are reproducible.
**Settled (PO):** `"24"` and `"twenty four"` are *not* unified. It is a deep rabbit hole and no running joke depends on it; revisit only if someone complains.

**D3 — Contractions are counted as one Token, and matched by expansion.**
`don't` is **one** Token with surface `don't`. For *Term matching*, its expansion `do not` is in the Term's alias set, so a Topic containing `do not` matches `don't`. *Rationale:* word-frequency lists should show what was actually said; topic matching should be forgiving. These are two different jobs and must not share one rule.

**D4 — Lemmatisation: group for display, store ungrouped.**
Tokens store `surface`, `normalized`, and `lemma`. The default word-frequency view is **lemma-grouped** — `run` (14) expandable to `run 6 / running 5 / ran 3`. *Rationale:* Rafa asks "how often did we do the hotdog bit", not "how often did the string 'hotdogs' occur". Storing all three keeps the ungrouped view a pure display toggle and costs nothing.
**Settled:** lemma-grouped default, with a visible "exact words" toggle (US-016).

**D5 — Stop words are filtered from *display*, never from *storage*.**
Every Token is indexed. A versioned English stop-word list (~180 items: articles, pronouns, auxiliaries, discourse markers) is excluded from the default top-N view and from "suggested topics". A user can switch the filter off, and a stop word used as an explicit Term in a Topic is **always** counted. *Rationale:* `the` must never be the headline insight, but `can` might matter in the running joke `can of worms`; destroying data at index time makes that unfixable.

**D6 — Multi-word Terms are matched on the normalized Token stream, space- and hyphen-insensitive.**
`hot dog`, `hotdog`, and `hot-dog` collapse to the same match key by removing internal separators from the candidate n-gram before comparison. So one Term `hotdog` with that key matches all three spellings, and `hotdogs` matches via the lemma from D4. *Rationale:* users think in concepts, not orthography; this is the literal stakeholder example and must be correct on day one.

**D7 — A Topic is user-defined in MVP. Machine-discovered clustering is `Later`. (Opinionated position.)**
A **keyword** is a string. A **Topic** is a named, versioned bundle of Terms with aliases. Arguments for user-defined:
- **Auditable.** The user can see exactly which words produce the count. An embedding cluster cannot be explained to someone who distrusts the number — and J1 step 6 proves distrust is the default state.
- **Stable across episodes.** The Series leaderboard and every trend require that "the hotdog thing" means the same thing in episode 1 and episode 40. Per-episode clustering is not stable; cluster 3 in one episode is not cluster 3 in another — which would make the Series view, the whole product, meaningless.
- **Testable.** A watchlist yields exact expected counts in a fixture, so acceptance criteria are falsifiable. "The clustering found a reasonable topic" is not a test.
- **Cheap.** No model, no tuning, no eval harness in the MVP.
The blank-page problem barely applies here: **a podcast group already knows its running bits by name.** Naming them is the fun part, not friction. Suggestions seeded from the episode's own top non-stop-word lemmas (US-021) cover the rest. That delivers most of the discovery value with none of the clustering machinery. Machine-discovered topics return later as *Suggested Topics* — proposals a user promotes into real Topics, never as the counted unit itself.

**D8 — Phrase matching may cross a sentence boundary, never a Speaker turn.**
Matching runs over the Token stream of one **Utterance**, ignoring sentence-ending punctuation, with **zero intervening tokens** allowed (exact adjacency after normalization) for MVP. So "…we shipped the hot. Dog ate it" would match `hot dog` — accepted as a rare false positive — while A saying "hot" and B saying "dog" never matches. **Chunk boundaries are invisible to matching:** after stitching, matching runs over the Episode's Token stream, so a phrase split across a chunk join still matches. Chunks are a mechanical upload unit, not a semantic one. *Rationale:* ASR punctuation is unreliable enough that respecting sentence boundaries would cause more false negatives than the false positives it prevents; speaker turns are semantically real and must be respected; chunk edges are an artefact of our own plumbing and must never change a count.
**Settled (PO):** no slop — adjacency only. It is deterministic and testable, and separator-insensitivity (D6) already covers the spellings people actually use. Slop needs a tuned window and an eval set to be anything but a guess.

**D9 — Mishearings are counted as what the ASR heard, and the discrepancy is surfaced, not hidden.**
If "hot dog" is transcribed "hotdoc", it is **not** counted. Overtone makes three guarantees instead of pretending to fix it: (a) every count links to its quotes so false positives are visible; (b) a Transcript-level quality score (mean ASR confidence, 0–100) with a **"poor" warning below 70** tells the user when counts are untrustworthy; (c) phonetic/fuzzy matching is a named `Later` capability, shipped only with a measured precision/recall baseline. *Rationale:* fuzzy matching without an eval set trades invisible false negatives for invisible false positives — strictly worse, because the user can no longer verify anything.

**D10 — Provenance is part of the definition of a count.**
An Insight that cannot enumerate the Tokens behind it is not a valid Insight and must not be rendered. *Rationale:* this single rule is what makes D1, D8 and D9 tolerable, and it is the acceptance-critical property in J1 step 6 and J5 step 2.

**D11 — One count engine, every surface.**
All counting — the Episode page, the Series leaderboard, the public Share page and the future assistant — executes the same **Query** object through the same engine. The assistant's only job is natural language → Query, plus prose over retrieved Segments; it never computes a number itself. *Rationale:* the alternative guarantees that the chatbot and the dashboard eventually disagree, which is unrecoverable (J5 step 2).

**D12 — An Episode's audio may be purged while the Episode and its Transcript survive.**
Deleting *audio* and deleting *an Episode* are different operations with different UI. An Episode whose audio is purged keeps every count and quote but loses playback. *Rationale:* this is the pressure valve for the **1 GB storage ceiling** — roughly 37 two-hour episodes. A show that runs for two seasons will need it, and a back-catalogue backfill (US-044) depends on it. **Default: retain** (playback is load-bearing for trust), with an explicit per-episode purge.

**D13 — Speaker attribution is by loudest Host Track over a once-transcribed Master. Host Tracks are never transcribed. (Opinionated position.)**
The Master is transcribed once and is the only source of words. For each Token, the Host Track with the highest energy in that Token's time window is credited with it; where no track exceeds the others by at least 3 dB the Token is attributed to `unknown`. *Rationale:* transcribing each host's track separately looks obvious and is wrong twice over. **Mic bleed:** every host's mic picks up the others faintly, so the same sentence appears in two or three transcripts and every count inflates — invisibly, and in proportion to how loud the room is. **Cost:** three hosts × a two-hour episode is six audio-hours against an allowance of two per hour, so one episode could not be processed at all. Energy attribution is exact, costs nothing, and — unlike diarisation — cannot be confidently wrong about *which words were said*, only about who said them.
**Consequences:** the sum of per-Speaker counts always equals the Episode total (the invariant test in US-014); Host Tracks need only an energy envelope, not storable audio; and an Episode with no Host Tracks renders no speaker breakdown rather than a guess.

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
| Say **Episode**, never "meeting", "call" or "recording", in the UI | This is a show. Earlier drafts were a meeting tool; the vocabulary is the tell |
| Never say "diarisation" in UI or code | Attribution is by Host Track energy (D13). The word implies a capability we deliberately do not have |
| Never send a **Host Track** to transcription | D13. One line of code away from inflating every number in the app |
| A timestamp shown or stored is always **episode-relative** | D8/D13 and US-040. A chunk-relative timestamp is a silent bug |
