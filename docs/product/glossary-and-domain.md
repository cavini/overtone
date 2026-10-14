# Overtone — Glossary & Domain Model

These nouns become tables, API resources, and test fixture names. One word, one meaning, everywhere. Where a term is ambiguous, a **Decision** is recorded with its rationale. All fifteen are settled.

**The show is recorded in Brazilian Portuguese.** Every counting rule below is a pt-BR rule. **They are not locale settings and are not reachable from any user preference** — D2, D3, D4, D5 and D6 would each be a different decision in English, and several would be the *opposite* decision. Example data in this doc, in fixtures and in acceptance criteria is pt-BR for that reason: English examples hide every rule that matters.

**"Language" means two unrelated things in this product and the words for them are not interchangeable.** The **analysis language** is always `pt` (D14) — it is the pipeline. The **interface language** is pt-BR or English, chosen by the reader (D16) — it is the presentation. Never write "language" unqualified again in this repo.

---

## 1. Core nouns

| Noun | Definition | Identity / cardinality | Not to be confused with |
|---|---|---|---|
| **Series** | One show: a named, ordered collection of Episodes. The scope over which running-joke trends, leaderboards and "did we ever" questions are answered. | Owned by one Library. 1 Library → 0..n Series; 1 Series → 0..n Episodes. | A Library (which may hold several shows) and a season (a date range over one Series, not its own noun). |
| **Episode** | A Recording placed in a Series, carrying an **episode number** (unique within its Series) and a **recorded-on date**. In practice every upload becomes an Episode; `episode_id` and `recording_id` are the same identifier. | 1 Series → 0..n Episodes. 1 Episode → **1 Master**, 1..n Chunks. | A file, and a Chunk. An Episode arrives as exactly one file — the published edit (D15). |
| **Recording** | The generic upload: one audio artifact plus its metadata (title, source filename, duration, byte size, content hash, upload time, language, processing status). `language` is always `pt` (D14). Becomes an **Episode** once it is in a Series. | Owned by exactly one Library. 1 Recording → 0..1 Transcript. | The audio *file*, which is a storage blob it points at. A Recording can outlive its audio (see Decision D12). |
| **Master** | The **final edited audio** of one Episode — the published mix, and the only transcription input. One per Episode; there is no second file of any kind (D15). | 1 per Episode. | The raw recording session, which Overtone never sees. "Master" is an internal noun; the UI says "the episode's audio". |
| **Chunk** | A contiguous slice of one Episode's Master, cut on a silence boundary, compressed and transcribed as one unit, carrying an `offset_ms` into the Episode. Our unit of upload, parallelism and retry. | 1 Episode → 1..n Chunks (a 2-hour episode is 5–6). | A Segment. A Chunk is chosen by us for mechanical reasons; a Segment is emitted by the ASR inside a Chunk. Chunk boundaries are invisible to counting (D8). |
| **Transcript** | The complete, ordered textual rendering of one Recording produced by one ASR run, with a model identifier, a produced-at timestamp, and a quality score. Immutable once written. | 1 per completed ASR run. A re-transcription creates a **new** Transcript; the old one is superseded, not mutated. | Analysis. A Transcript holds words, never counts. |
| **Segment** | A contiguous, timestamped span of one Transcript as emitted by the ASR engine, with `start_ms`, `end_ms`, text, and mean confidence. The atomic unit of *retrieval*, the body of a quote, and the thing a timestamp link points at. | 1 Transcript → many Segments, non-overlapping, ordered. Typically 2–30 s. | A sentence. Segments are machine-chosen spans; they may split or merge sentences. |
| **Token** | One occurrence of one lexical item at one position in one Transcript: `{episode_id, transcript_id, chunk_id, segment_id, position, start_ms, surface, normalized, lemma, lemma_source}`. `start_ms` is always **episode-relative** — chunk offsets are applied once, at stitching. The grain of all counting. | Many per Segment. Punctuation and whitespace are **not** Tokens. | Word (the type). A Token is an instance; a Word/Term is a type. |
| **Term** | A countable lexical *type* the system can count: a single word or a multi-word phrase, defined by a canonical form plus an alias set (surface variants that count as the same thing — including spoken/written orthographic variants, D3). | Global dictionary of canonical terms; aliases resolve to one Term. | Token (instance) and Topic (bundle of Terms). |
| **Topic** | A **named, user-defined bundle of Terms** — in this app, usually a **running joke**: Topic `a parada do guardachuva` = Terms `guardachuva`, `guarda chuva`, `guarda-chuva`, `guardachuvão`. Scoped to a Library, applied to every Episode in it, past and future. | 1 Library → 0..n Topics; 1 Topic → 1..n Terms. | Keyword. A keyword is a bare string; a Topic is a stable, named, aliased, auditable concept. See Decision D7. |
| **Analysis** | One computed result set over one Recording for one configuration (normalization version, stop-word list version, lemma dictionary version, topic set version), with the config recorded. Re-runnable and reproducible. | 1 Recording → 1..n Analyses; the newest is the default view. | Transcript. Analysis is derived and disposable; Transcript is expensive and retained. |
| **Insight** | A single presentable finding produced by an Analysis: a count, a rate, a rank, or a trend — always carrying its provenance (which Tokens produced it). | Many per Analysis. | Analysis (the container). |
| **Library** | Everything one owner has: their Series, Episodes, Topics, Analyses and Queries. The tenancy boundary. **Every friend has their own Library**; they see each other's numbers through a Share Link, never through a shared Library. | 1 per user account. | A Series (a Library may hold several) and a team workspace (there isn't one). |
| **Query** | A structured specification of a question over a Series or Library: `{terms/topics, episode filter, date range, group_by, metric}`. Executed by one shared count engine for the Episode page, the Series leaderboard, the Share page and later the assistant. | 0..n per Library. | A UI filter state. Query is a first-class domain object precisely so the future assistant compiles natural language *into* it rather than around it. |
| **Share Link** | An unguessable, revocable URL granting anonymous read-only access to exactly one Episode's **Insights and the quotes behind them**. **Settled (stakeholder): counts and quotes, never the full Transcript**, no audio, no other Episode, no Series, no Library. | 0..1 per Episode. | A shared Library, and a published transcript. A Share Link is the entire sharing model. |

### Relationship sketch (words, not schema)

> A **Library** holds **Series**; a Series holds numbered **Episodes**. An Episode is one file — its **Master**, the published edit — split into **Chunks** for upload and transcription. The Chunks' results stitch into one **Transcript**: an ordered list of **Segments**, tokenised into **Tokens** with episode-relative timestamps. Each Token resolves to a **Term**; a **Topic** names a set of Terms. An **Analysis** counts Tokens by Term/Topic under a stated configuration and emits **Insights**. A **Query** aggregates Tokens across a Series and is the single execution path for the Episode page, the Series leaderboard, a **Share Link** page and the future assistant.

---

## 2. Decisions: what exactly counts as "a word was said"

**D1 — A count is a count of Tokens, as transcribed.**
"The word *churrasco* was said 23 times" means: 23 Tokens in the current Transcript of this Recording resolve to the Term `churrasco`. Repeats always count (saying it twice in one sentence is two). *Rationale:* the only definition that is deterministic, testable, and explainable. **Consequence:** counts describe the transcript of the **published** episode (D15), not reality — so the UI must say "as transcribed" and every count must drill to quotes (see D10).

**D2 — Normalization pipeline for pt-BR (fixed order, versioned).**
1. Unicode **NFC** — composed form, never NFKC and never NFD.
2. Lowercase.
3. Strip leading/trailing punctuation only.
4. Hyphens: split enclitic pronouns, keep compounds whole — see D3.
5. Separate the **filler class** from the word index: non-lexical ASR artifacts only (`ah`, `ahn`, `ãh`, `hum`, `hmm`, `eh`, `uh`). Lexical discourse markers — `tipo`, `né`, `assim`, `sabe`, `cara` — are **real Tokens** on the stop-word list (D5), because any one of them is a plausible running joke and `é` (is) must never be mistaken for a filler `eh`.
6. Numbers kept as written by the ASR (`"24"` and `"vinte e quatro"` are different Tokens).

**⚠️ DIACRITICS ARE PRESERVED. This is a hard rule with a test, not a preference.** The English-pipeline reflex — NFD then strip combining marks, or any `deburr`/`unaccent`/`strip_accents` call — merges genuinely different Portuguese words and every count in the app goes quietly wrong:

| Stripping accents merges | Which are | Nothing in the product can detect this |
|---|---|---|
| `e` / `é` | and / is | Both are hyper-frequent. The merged count is meaningless and still renders |
| `por` / `pôr` | by / to put | Preposition folded into a verb |
| `esta` / `está` | this / is | Demonstrative folded into the most common auxiliary in the language |
| `as` / `às` | the (fem. pl.) / at the | Article folded into a contraction |

Casefold only. The version string is stored on every Analysis so counts are reproducible.
**Settled (PO):** `"24"` and `"vinte e quatro"` are *not* unified. It is a deep rabbit hole and no running joke depends on it; revisit only if someone complains.

**D3 — Hyphens, contractions and clitics: the pt-BR tokenisation rules.**

**(a) Enclitic pronouns split; compounds stay whole.** Portuguese attaches object pronouns to verbs with a hyphen. The pronoun is a separate (stop)word and the **verb** is the thing being counted, so these split:

| Splits into verb + pronoun | Stays one Token |
|---|---|
| `diga-me` → `diga` + `me` | `guarda-chuva` (umbrella) |
| `fazê-lo` → `fazê` + `lo` | `fim-de-semana` (weekend) |
| `dá-se` → `dá` + `se` | `segunda-feira` (Monday) |
| `vamo-nos` → `vamo` + `nos` | `couve-flor`, `bem-vindo`, `porta-malas` |

**The rule that distinguishes them is a closed suffix list, and it is the only tractable version.** Split if and only if the text after the **final** hyphen is exactly a member of the enclitic-pronoun list `me, te, se, lhe, lho, nos, vos, lo, la, los, las, no, na`. Everything else keeps its hyphen. Mesoclisis (`dar-te-ei`) falls out of the same rule applied right to left.

**Which way the ambiguous cases fall: they stay whole.** The pronouns `o, a, os, as` are **deliberately left off the list**, because they are also the articles and are the second element of real compounds. So `dá-o` and `vê-a` keep their hyphen and are counted as one odd Token — a named, deliberate miss. The cost is near zero: `-o/-a` enclisis is vanishingly rare in spoken Brazilian Portuguese, where the group will say *dá ele* or *me dá*. Leaving those four off the list is what makes the compound side of the table safe without maintaining a dictionary of every hyphenated compound in the language.

The verb half of a split keeps the accent the split leaves behind (`fazê`, `comê`, `dá`), which is not a word on its own. Its **lemma** is the infinitive (`fazer`, `comer`, `dar`), and the lemma is what gets counted — see D4. If a compound is ever split wrongly, it is still findable as a Term, because multi-word matching is separator-insensitive (D6).

**(b) Mandatory contractions are single Tokens, never expanded.** `do` (de+o), `da`, `no`, `na`, `pelo` (por+o), `pela`, `nele`, `dele`, `aos`, `num`, `àquela` are standard orthography — this is how the words are spelled, not an abbreviation. Most of them belong on the stop-word list (D5).

**(c) Spoken contractions are counted as said, and matched by alias.** `pra` (para a), `pro`, `tá` (está), `tô`, `né` (não é), `cê` (você), `vamo`, `peraí` — three friends talking casually will use these constantly, and they are kept as the surface the ASR emitted.
**The complication, and it is a real one: Whisper tends to emit written-standard Portuguese.** A speaker who said `pra` may be transcribed `para`; `tá` as `está`; `né` as `não é`; `cê` as `você`. **So a Term's count can move because of an orthographic choice the speaker never made.** We cannot stop that, so the product answer, not a technical one: **a running joke's watchlist carries both the spoken and the written variant as aliases of one Term** — `{pra, para a, para}`, `{tá, está}`, `{né, não é}`, `{cê, você}`. The alias set already exists (D7) and absorbs this at no cost. Acceptance criteria must force it to be tested against a real provider response, not an idealised fixture (US-004).

**D4 — Lemmatisation is load-bearing in pt-BR, not a display nicety.**
A Portuguese verb has roughly **50 inflected forms** — `falar, falo, falas, fala, falamos, falei, falou, falava, falaria, falando, falado, falasse…` — all one lemma. In English, grouping `run/running/ran` was a convenience. Here, **an ungrouped count of a verb is not an answer to any question a user asked.** Tokens therefore store `surface`, `normalized`, `lemma` and `lemma_source`, and the default word-frequency view is **lemma-grouped**: `falar (14)` expandable to `falou 5 / falei 4 / falar 3 / falando 2`.

**The risk, named: aggressive stemming over-merges, and a false merge inflates a count invisibly.** Portuguese Snowball maps `casa` (house) and `casar` (to marry) both to `cas`; `comer` (to eat) stems to `com`, which collides with the preposition `com` (with) and would push a stop word into the top terms. So: **dictionary lookup first, stemmer only as a marked fallback** for out-of-dictionary tokens — names, slang, in-jokes, English loanwords, which is exactly the vocabulary a podcast is full of.

**And this is where the trust design earns its keep.** Because D4 stores all three forms and the UI shows **which surface forms merged into a Term**, an over-merge is **visible and correctable** — the user sees `com` expand to `com 412 / comer 9 / comemos 3`, recognises it as wrong, and splits it with an alias. It is not a silent wrong number. That property is the whole reason the per-surface breakdown is mandatory rather than optional.
**Settled:** lemma-grouped default ships with the first word list (US-005), including the per-surface breakdown. The separate "exact words" toggle stays US-016.

**D5 — Stop words are filtered from *display*, never from *storage*.**
Every Token is indexed. A versioned **pt-BR** stop-word list (**~200 items** — articles `o/a/os/as/um/uma`, prepositions and their mandatory contractions `de/do/da/em/no/na/por/pelo/para/pra/com/sem`, subject and clitic pronouns `eu/você/cê/me/te/se/lhe/nos`, inflections of `ser/estar/ter/haver/ir`, and discourse markers `né/tipo/assim/aí/então/cara`) is excluded from the default top-N view and from "suggested topics". It is larger than the English list it replaces, because mandatory contractions and auxiliary inflections multiply the entries. A user can switch the filter off — a **display** toggle, not a language setting: the list itself is always the pt-BR one, whatever the interface language is (D16) — and **a stop word used as an explicit Term in a Topic is always counted.** *Rationale:* `que` must never be the headline insight, but `né` absolutely might be the running joke — and the clitic pronouns that D3 splits off land on this list, which is precisely what makes splitting safe: the pronoun is filtered from display, the verb is counted.

**D6 — Multi-word Terms are matched on the normalized Token stream, separator-insensitive, lemma-by-lemma.**
`guarda chuva`, `guardachuva` and `guarda-chuva` collapse to the same match key by removing internal separators from the candidate n-gram before comparison, so one Term matches all three spellings.

**pt-BR adds agreement, which multiplies the variants of every phrase.** Nouns carry gender and number and adjectives agree with them: `o guardachuva` / `os guardachuvas`, `a linguiça` / `as linguiças`, `bonito / bonita / bonitos / bonitas`. A watchlist handles that with three rules, in this order:
1. **Each token of a multi-word Term matches on its lemma**, not its surface. So the Term `linguiça bonita` matches "as linguiças bonitas" — the user types it once, in the singular, and every agreement form matches.
2. **Leading articles and determiners in a Term are ignored at match time** (they are stop words anyway), so `o guardachuva`, `os guardachuvas` and `guardachuva` are the same Term and the user cannot get it wrong by typing the article.
3. **Anything irregular goes in the alias set** — plus the spoken/written pairs from D3. The alias set is the escape hatch for every case rules 1 and 2 miss.

*Rationale:* users think in concepts, not orthography or morphology; the guardachuva example is the literal stakeholder example and must be correct on day one.

**D7 — A Topic is user-defined in MVP. Machine-discovered clustering is `Later`. (Opinionated position.)**
A **keyword** is a string. A **Topic** is a named, versioned bundle of Terms with aliases. Arguments for user-defined:
- **Auditable.** The user can see exactly which words produce the count. An embedding cluster cannot be explained to someone who distrusts the number — and J1 step 6 proves distrust is the default state.
- **Stable across episodes.** The Series leaderboard and every trend require that "a parada do guardachuva" means the same thing in episode 1 and episode 40. Per-episode clustering is not stable; cluster 3 in one episode is not cluster 3 in another — which would make the Series view, the whole product, meaningless.
- **Testable.** A watchlist yields exact expected counts in a fixture, so acceptance criteria are falsifiable. "The clustering found a reasonable topic" is not a test.
- **Cheap.** No model, no tuning, no eval harness in the MVP.
- **It is also the only mechanism that absorbs D3's orthography problem and D6's agreement problem.** An alias set was always a *set of patterns* rather than one string, so `{pra, para}` and `{linguiça, linguiças}` ride a thing that already exists.
The blank-page problem barely applies here: **a podcast group already knows its running bits by name.** Naming them is the fun part, not friction. Suggestions seeded from the episode's own top non-stop-word lemmas (US-021) cover the rest. That delivers most of the discovery value with none of the clustering machinery. Machine-discovered topics return later as *Suggested Topics* — proposals a user promotes into real Topics, never as the counted unit itself.

**D8 — Phrase matching may cross a sentence boundary. There is no speaker boundary to cross.**
Matching runs over the **Episode's** Token stream after stitching, ignoring sentence-ending punctuation, with **zero intervening tokens** allowed (exact adjacency after normalization) for MVP. So "…comprei o guarda. Chuva molhou" would match `guarda chuva` — accepted as a rare false positive. **Chunk boundaries are invisible to matching:** a phrase split across a chunk join still matches. Chunks are a mechanical upload unit, not a semantic one. **There is no per-speaker restriction, because there is no speaker attribution** (D15) — with one edited file the Token stream is one continuous sequence, and a phrase whose two halves were spoken by two different people will match. That is a false positive we accept; it is rare, and the alternative does not exist. *Rationale:* ASR punctuation is unreliable enough that respecting sentence boundaries would cause more false negatives than the false positives it prevents; chunk edges are an artefact of our own plumbing and must never change a count.
**Settled (PO):** no slop — adjacency only. It is deterministic and testable, and separator-insensitivity (D6) already covers the spellings people actually use. Slop needs a tuned window and an eval set to be anything but a guess.

**D9 — Mishearings are counted as what the ASR heard, and the discrepancy is surfaced, not hidden.**
If `guarda-chuva` is transcribed `guarda chuvas`, D6 catches it; if it is transcribed `guada chuva`, it is **not** counted.

**⚠️ This decision carries materially more weight in pt-BR than it did in English.** Portuguese word error rates are higher, and the worst cases are **proper nouns, Brazilian slang, regionalisms, invented words and in-jokes** — which is a problem, because **in-jokes are the product.** The terms this group most wants counted are the terms the transcriber is worst at. Overtone makes three guarantees instead of pretending to fix it: (a) every count links to its quotes so false positives are visible; (b) a Transcript-level quality score (mean ASR confidence, 0–100) with a **"poor" warning below 70** tells the user when counts are untrustworthy; (c) phonetic/fuzzy matching is a named `Later` capability, shipped only with a measured precision/recall baseline. A mishearing the group notices can be added to a Term's alias set by hand — visible, auditable, theirs. *Rationale:* fuzzy matching without an eval set trades invisible false negatives for invisible false positives — strictly worse, because the user can no longer verify anything.

**D10 — Provenance is part of the definition of a count.**
An Insight that cannot enumerate the Tokens behind it is not a valid Insight and must not be rendered. *Rationale:* this single rule is what makes D1, D8 and D9 tolerable, and it is the acceptance-critical property in J1 step 6 and J5 step 2.

**D11 — One count engine, every surface.**
All counting — the Episode page, the Series leaderboard, the public Share page and the future assistant — executes the same **Query** object through the same engine. The assistant's only job is natural language → Query, plus prose over retrieved Segments; it never computes a number itself. *Rationale:* the alternative guarantees that the chatbot and the dashboard eventually disagree, which is unrecoverable (J5 step 2).

**D12 — An Episode's audio may be purged while the Episode and its Transcript survive.**
Deleting *audio* and deleting *an Episode* are different operations with different UI. An Episode whose audio is purged keeps every count and quote but loses playback. *Rationale:* this is the pressure valve for the **1 GB storage ceiling** — roughly 37 two-hour episodes, about nine months of a weekly show. A show that runs for two seasons will need it; nothing imports a back catalogue, so it is the only thing that fills the tier. **Default: retain** (playback is load-bearing for trust), with an explicit per-episode purge.

**D14 — The language is declared as `pt` on every transcription request, never auto-detected. (Opinionated position.)**
Every chunk is sent with `language: "pt"` set explicitly. Auto-detection is never used, not even as a default. *Rationale:* detection misfires on exactly this input — accented conversational speech reads as Spanish, Galician or Italian, and a chunk dense with English tech vocabulary reads as English. And because chunks are transcribed **independently and in parallel** (D8, US-040), per-chunk auto-detection can return **different languages for different chunks of one episode**, stitching a transcript that is half confident nonsense. A declared language cannot do that. Every Recording's `language` field is `pt`; English or other-language audio is the odd case, warned about after the fact rather than detected before it (US-013). **This field is the analysis language and has nothing to do with what language the reader's interface is in** (D16) — it is never read from a user preference, a request header, a cookie or a locale.

**Code-switching into English is normal and is counted as spelled.** Brazilian podcasts drop English tech and meme vocabulary constantly — `deploy`, `bug`, `hype`, `random`, `cringe`, `spoiler`. Those tokens are **ordinary Tokens**: same NFC/lowercase normalization, no translation, no per-token language tag, no English stop-word list and no English lemmatiser. An English word the pt-BR lemma dictionary does not know is its own lemma, so `deploy` and `deploys` are two Terms until the user aliases them — and Whisper may render the same word in English or in pt orthography, so **both spellings belong in the alias set**, the same mechanism as D3(c). *Rationale:* a second language means a second pipeline (D2–D6 are all pt-BR rules); pretending otherwise would hide a wrong number.

**D15 — The uploaded file is the published edit. Counts describe the episode listeners heard. (Opinionated position.)**
There is **one audio file per Episode and it is already edited** — the stakeholder: *"they would only upload the final edited file."* Retakes, tangents and some filler have been cut before Overtone ever sees it. This is stated here rather than left as an assumption, because it changes what every number in the app means:

- **A count is a count over the published episode, not the raw conversation.** For a podcast that is arguably the *more* meaningful measurement: *"a gente falou 'né' 312 vezes nessa temporada"* is a fact about the show the audience actually heard. But the app must say so and must not imply the other thing.
- **Filler-word and pace metrics (US-018) measure the edit at least as much as the speaker.** A host who said `né` 200 times and had 80 of them cut reads as 120. We report the number and name what it is; we never present it as someone's speech habit.
- **A term cut in the edit is a true zero in Overtone and a false zero about the conversation.** Drill-down (D10) cannot show what is not in the file. Accepted, and said out loud.
- **Speaker attribution is impossible and is removed from the product** — not deferred. One mixed file carries no per-host signal, and the free stack has no diarisation. "Who talks most" is gone, along with the `Host Track`, `Speaker` and `Utterance` nouns and decision D13 (see below).
- **The upload flow gets simpler and chunking does not change at all.** One file, one drop zone, no track-set concept, no per-host naming step, no track-alignment check. The file is still 100–120 minutes and is still split on silence and transcribed in parallel (US-040).

**D16 — The interface language and the audio language are different things and must never be conflated. (Opinionated position.)**
**Settled (stakeholder): the interface is bilingual — Brazilian Portuguese and English, switchable, persisted per user, pt-BR by default.** The **audio is always Brazilian Portuguese** and the **analysis pipeline is always `pt`** (D14). A user reading the interface in English is still analysing pt-BR speech.

Two axes, and only one of them moves a number:

| | **Analysis language** | **Interface language** |
|---|---|---|
| Value | always `pt` | `pt-BR` (default) or `en`, per user |
| Set by | us, explicitly, on every transcription request (D14) | the reader, at any time (US-046) |
| Decides | normalization (D2), tokenising and clitic splitting (D3), lemmatisation (D4), the stop-word list (D5), phrase matching (D6) | which catalogue renders a message code, and how numbers and dates are formatted |
| Changes a count? | yes — it *is* the counting pipeline | **never** |

**The invariant: a count must never change because the interface language changed.** Switching to English changes every string on screen and not one number — same Transcript, same Segments, same Tokens, same lemmas, same Analysis, same totals. Only the presentation moves: `1.234,56` becomes `1,234.56`, `08/10/2026` becomes `10/8/2026`. US-046 asserts it as an invariant test; rule 8 of *What must stay true in the data model* in `backlog.md` keeps it true.

**Consequences, each one acceptance-criteria-bearing:**
- **No layer below the presenter knows a language.** A user-facing message is a `SCREAMING_SNAKE_CASE` **code plus named parameters**; the sentences live in two catalogues and nowhere else (US-045, and the **Message codes** table in `backlog.md`). **A test asserts the code, never the sentence** — asserting an English sentence would hard-code one reader's locale into the domain, which is exactly the bug this decision prevents.
- **Numbers are this product's entire output,** so locale formatting is correctness, not polish. A count rendered `1,234` to a pt-BR reader is a real defect.
- **A share-link visitor has no account.** The public page follows the visitor's browser, defaulting to pt-BR, and carries its own switch. The owner's setting never decides what a visitor reads (US-039).
- **Rafa and Mel read pt-BR; the English interface is for the people they show it to.** It is not a step towards analysing English audio — that is a second pipeline and is out of scope.

*Rationale:* this is the conflation that writes itself. One field called `language`, one URL parameter, one function argument shared between the presenter and the pipeline, and the stop-word list starts following the UI. Then the same episode reports different numbers to two readers, and no test catches it because every test was written in one language.

**pt-BR labels for the user-facing nouns**, fixed here so the two catalogues cannot drift:

| Noun | pt-BR label | Noun | pt-BR label |
|---|---|---|---|
| Series | **Série** | Transcript | **Transcrição** |
| Episode | **Episódio** | Segment | **Trecho** |
| Recording | **Gravação** | Chunk | **Parte** |
| Library | **Biblioteca** | Term | **Termo** |
| Topic | **Tema** — a running joke is copy-named *piada interna* | Share Link | **Link de compartilhamento** |

**Chunk is `Parte` and Segment is `Trecho`, never the other way round** — both read naturally as "trecho" in Portuguese, which is how a catalogue drifts. Token, Master, Analysis, Insight and Query are internal nouns and appear in neither interface. The six statuses keep their English values in code and data and are *displayed* through the `STATUS_*` labels.

### Removed from this document

| Was | Why it is gone |
|---|---|
| **D13** — speaker attribution by loudest Host Track | There are no per-host tracks; nothing can be attributed to a person (D15). **The id `D13` is retired, not reused** — other docs reference it and must not silently pick up a new meaning. |
| Noun **Host Track** | Never uploaded. Deleted with D13. |
| Noun **Speaker** | Unpopulatable. "Who talks most" is removed from the product, not deferred, so a noun for it would be a trap. `speaker_id` and the Query's speaker filter go with it. |
| Noun **Utterance** | Defined as "a run of Segments attributed to a single Speaker". With no Speaker the concept has no referent; **Segment** is the span a quote and a drill-down link point at. **Resolved (architecture): `Utterance` is renamed `Segment` repo-wide** — `system-design.md` stores `segments` and ADR 0007 names its tool `search_segments`. The word is gone from the codebase, not just from this doc. |

---

## 3. Vocabulary hygiene rules

| Rule | Reason |
|---|---|
| **Never strip accents.** NFC in, NFC stored, NFC compared. No `unaccent`, `deburr`, `strip_accents`, or NFD-plus-filter, anywhere | D2. It merges `e`/`é` and `esta`/`está`, and every count in the app goes quietly wrong |
| Never say "file" in the UI where a **Recording** is meant | A Recording survives its file (D12) |
| Never say "keyword" in UI or code | It is either a **Term** or a **Topic** (D7) |
| Never render a count without its drill-down affordance | D10 |
| Never render a lemma-grouped count without the surface forms that merged into it | D4. It is the only thing that makes an over-merge (`comer` → `com`) visible instead of silent |
| Never say "accurate"; say **"as transcribed"** | D1/D9 — the product cannot claim ground truth, and pt-BR is worst on in-jokes |
| Never say "who talks most", "speaker", "per-host" or "diarisation" in UI or code | There is one edited file and nothing can be attributed to a person (D15). The question is closed, not parked |
| Never say "Utterance"; say **Segment** | D13's noun. See Removed, above |
| `word count` = total Tokens; `unique words` = distinct Terms; never interchange | Two different numbers users read off the same screen |
| Statuses are exactly: `uploaded`, `transcribing`, `analyzing`, `ready`, `failed`, `deleting` | Tests assert on these strings |
| Say **Episode**, never "meeting", "call" or "recording", in the UI | This is a show. Earlier drafts were a meeting tool; the vocabulary is the tell |
| Example data in docs, fixtures and AC is **Brazilian Portuguese** | D2–D6, D14. English examples hide every rule that matters and let an accent-stripping bug ship green |
| A timestamp shown or stored is always **episode-relative** | D8 and US-040. A chunk-relative timestamp is a silent bug |
| Never say "language" unqualified. Say **analysis language** (always `pt`) or **interface language** (pt-BR or `en`) | D16. One shared word is how the UI locale ends up selecting a stop-word list |
| Never let an interface locale reach normalising, tokenising, lemmatising, matching or counting | D16. The audio is always pt-BR. A count that moves with the UI language is the defect the whole decision exists to prevent |
| Never assert a user-facing sentence in a test. Assert a **message code** and its parameters | D16, US-045. The text exists in two languages; the catalogues are the only place wording is asserted |
| Never render a count or a date by interpolating it into a string | D16. It must pass through the locale formatter — pt-BR `1.234,56` and `08/10/2026`, en `1,234.56` and `10/8/2026` |

**Resolved (stakeholder) → D16.** The **interface language** is **Brazilian Portuguese and English, switchable**, pt-BR by default. It was the last open question in this document, and the answer reached further than expected: because the text now exists in two languages, **no acceptance criterion may assert a user-facing sentence** — every message is a code plus parameters, rendered by a catalogue (US-045), and `backlog.md` carries the full code table. Nothing in the counting pipeline moved: the audio and the analysis are pt-BR whatever the interface reads, and US-046 asserts that a count never changes when the interface language does.

**No ⚠️ NEEDS CONFIRMATION remains in this document.**
