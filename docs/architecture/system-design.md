# System Design

**Status:** settled · **Companion to:** `tech-stack.md`, `../product/glossary-and-domain.md` · **Decided in:** ADR 0010

---

## 1. System context

There are no long-running processes. Three boxes, and we only own one of them.

```
  ┌───────────┐  1. split on silence into ~20-25 min   ┌──────────────────┐
  │  Browser  │     chunks, encode 16kHz mono Opus,     │ Supabase Storage │
  │ Next.js   │     signed PUT each chunk            ─► │   audio, 1 GB    │
  │           │                                         └────────┬─────────┘
  └─────┬─────┘                                                  │
        │ 2. POST /api/episodes/:id/process                       │ 5. signed
        ▼                                                         │    read
  ┌─────────────────────────┐                                     │ (playback)
  │ Vercel function         │  3. N chunks, IN PARALLEL           │
  │ · transcribe chunks     │ ──────────────────────► ┌────────────────────┐
  │ · stitch w/ offsets     │ ◄────────────────────── │ Groq               │
  │ · lemma lookup (1 qry)  │     words + timings     │ whisper-large-v3-  │
  │ · analyse, write        │      language = pt      │ turbo              │
  └──────────┬──────────────┘                         └────────────────────┘
             │ 5. insert
             ▼
  ┌─────────────────────────┐
  │ Supabase Postgres       │
  │ · domain tables         │
  │ · tsvector full-text    │
  │ · pgvector (later)      │
  │ · Auth (magic link)     │
  └─────────────────────────┘
```

Steps 2–4 are **one HTTP request** — tens of seconds for a 2-hour episode, because the chunks transcribe concurrently. No queue, no worker, nothing to keep running.

**Chunking is what makes that true.** A single serial 2-hour request risks exceeding Vercel's 300 s limit; four parallel 25-minute chunks finish in roughly the time of the slowest. The no-worker design of ADR 0010 rests on ADR 0011's chunking, not the other way round.

---

## 2. Processing an episode

```
uploaded ──► transcribing ──► analyzing ──► ready ──► deleting
   │              │               │
   └──────────────┴───────────────┴──► failed ──► (retry) ──► uploaded
```

Those six strings are canonical, from `../product/glossary-and-domain.md`. Tests assert on them literally.

| Stage | Does |
|---|---|
| `uploaded` | Browser has compressed each track to ~64 kbps mono and PUT it to a signed Storage URL. Server validates size, probes real duration. |
| `transcribing` | Fetch each chunk of the **master** file from Storage, POST to Groq **concurrently with `language: "pt"`** (never auto-detected — a misdetection would yield confident nonsense), store every raw response verbatim, then stitch: offset each chunk's word timings by its start and concatenate into `utterances`. |
| `analyzing` | One bulk `lemmas` lookup for this episode's distinct forms, then the pure pt-BR engine: NFC normalise (**accents preserved**) → clitic-aware tokenise → lemmatise by dictionary, stem as fallback → classify stop words and fillers → term frequency → n-gram watchlist matches. |
| `ready` | `insights`, `term_counts` and `mentions` written. The episode page and the series rollups have everything. |
| `failed` | A typed `failure_reason` and a human-readable message. Retryable without re-uploading, because the audio is already in Storage. |
| `deleting` | Row and audio being removed. |

**Still two stages, still independently re-runnable.** ADR 0005 survives the loss of the queue: transcription is paid-for-in-rate-limit and non-deterministic, analysis is free and deterministic. `POST /api/episodes/:id/reanalyze` re-runs analysis alone against the stored transcript. During development, when every tokeniser tweak needs re-deriving every count, this is the difference between a two-second loop and burning the daily Groq allowance.

### Chunk and stitch

An episode over 25 MB after compression is split on silence, each chunk transcribed separately, and the word timestamps offset by the chunk's start before concatenation. The offsetting is the whole risk: an off-by-one silently corrupts every timestamp after the join, and a wrong timestamp means a count that drills to the wrong moment. It gets property tests against a known-good single-pass transcript of the same audio.

---

## 3. Data model

```
users(id, email, created_at)                           -- Supabase Auth
   └─ series(id, owner_id, title, created_at)          -- the show
        ├─ series_members(series_id, user_id, role)    -- ADR 0012: scope reads by THIS
        ├─ topics(id, series_id, name, color)          -- the running jokes
        │    └─ topic_terms(id, topic_id, pattern, match_key)
        └─ episodes(id, series_id, number, title, recorded_on,
                    status, failure_reason, pipeline_version,
                    duration_ms, share_token, created_at)
             ├─ chunks(id, episode_id, index, blob_key,
             │          start_ms, end_ms, byte_size, status)  -- the master, split
             ├─ transcripts(id, episode_id, provider, provider_model,
             │         raw_provider_payload jsonb, full_text,
             │         quality_score, normalization_version)
             │    └─ utterances(id, transcript_id, start_ms, end_ms,
             │                  text, tsv tsvector,
             │                  words jsonb)            -- [surface,lemma,startMs,endMs,class]
             ├─ insights(id, episode_id, pipeline_version, word_count,
             │           unique_word_count, words_per_minute, computed_at)
             ├─ term_counts(id, episode_id, lemma, surface_forms text[],
             │              count, lemma_source)       -- dictionary | stemmer
             └─ mentions(id, episode_id, topic_id, utterance_id,
                         token_position, matched_text, start_ms, end_ms)

queries(id, user_id, series_id, name, spec jsonb)      -- a saved question

lemmas(form, lemma, pos)                               -- static pt-BR dictionary,
                                                       -- shared by every user
```

Decisions that are expensive to change, so they are made now:

- **There is no speaker dimension at all** (ADR 0015). Only the final edited file is uploaded, so no per-host signal exists and no free service diarises. `hosts`, `host_tracks` and the energy-attribution design are gone. Note what removing a whole feature cost: one optional table and nothing in the counting engine — the dependency rule (ADR 0016) earning its keep.
- **`lemmas` is a static shared dictionary, read with one bulk query per episode.** `select form, lemma from lemmas where form = any($1)` over that episode's ~3–5k distinct forms, then the map is passed **into** the pure analysis functions. That is what lets `packages/core` keep its no-I/O rule while still having a dictionary (ADR 0014/0016).
- **`term_counts.lemma_source` records whether a grouping came from the dictionary or the stemmer.** Stemmed groupings are heuristic and can over-merge (`casa`/`casar`), so the UI marks them and the user can split them with an alias. We never hide the provenance of a merge.
- **Word timings live in `utterances.words` as compact JSONB, not one row per token.** A 2-hour episode is ~20 k words; one row each would be ~4–5 MB per episode and would exhaust the 500 MB free database at about 110 episodes. JSONB is roughly a quarter of that. Counting reads `term_counts`; playback reads the JSONB for only the utterances on screen.
- **Every read is scoped by `series_members`, never by `owner_id`** (ADR 0012). A new series gets exactly one member — its owner — so this behaves identically to single-owner today, while "invite a co-host" stays a row insert instead of a migration touching every query and RLS policy. Writing the predicate this way from the first query means there is no cutover to forget.
- **`topics` are scoped to the `series`, not the episode.** A running joke belongs to the show. This is the schema fact that makes "how many times have we *ever* mentioned the hotdog thing" one indexed aggregate instead of a scan.
- **`term_counts` is materialised per episode**, invalidated by `pipeline_version`. The series rollup — the feature the stakeholder actually asked for — is then a `SUM ... GROUP BY lemma` over a few dozen small rows, not an aggregate over millions of tokens.
- **`term_counts` and `mentions` stay real tables** because every aggregate query touches them, and they are small — a few thousand rows per episode rather than twenty thousand.
- **All three forms stored: `surface`, `normalized`, `lemma`** (domain decision D4). Lemma-grouped is the default view with an "exact words" toggle; storing all three makes that a display concern, not a re-analysis.
- **`share_token`** is an unguessable per-episode token. Present means the stats page is publicly readable; revoking is deleting the column value. No separate ACL system for a feature this small.
- **Audio and transcripts have different lifetimes** (ADR 0013). Audio for recent episodes is kept for playback and the oldest is auto-purged as storage fills; transcripts and counts are kept forever. A purged episode keeps every number and quote and loses only playback. Storage pressure must never be able to change a count.
- **`raw_provider_payload` is never discarded.** It is how we re-derive everything, compare providers, and debug a wrong count without spending the daily transcription budget twice.

---

## 4. API surface

Next.js Route Handlers. Every body is a Zod schema in `packages/contracts`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/episodes` | Create the episode and its tracks; return a signed upload URL per track |
| `POST` | `/api/episodes/:id/process` | Transcribe + analyse, synchronously. The whole pipeline. |
| `POST` | `/api/episodes/:id/reanalyze` | Re-run analysis only, against the stored transcript |
| `GET` | `/api/episodes/:id` | Insights, top terms, topic mentions |
| `GET` | `/api/episodes/:id/transcript` | Paged utterances for the reader |
| `DELETE` | `/api/episodes/:id` | Delete row **and** audio — a promise, so it gets its own test |
| `GET` | `/api/series/:id/overview` | **The headline view.** Every episode, side by side. |
| `GET` | `/api/series/:id/trends?topicId=&from=&to=` | A topic across the whole series over time |
| `GET` | `/api/series/:id/leaderboard` | Top terms and top topics across every episode |
| `GET/POST/PATCH/DELETE` | `/api/series/:id/topics[/:topicId]` | Manage the running jokes |
| `POST/DELETE` | `/api/episodes/:id/share` | Mint or revoke the public share token |
| `GET` | `/s/:shareToken` | The public stats page. No auth. |
| `GET` | `/api/cron/keepalive` | Daily Vercel Cron ping so Supabase doesn't pause |

The three `/api/series/*` rows are the hinge. They are the cross-episode analytics the stakeholder asked for, **and** the exact functions the assistant will later call as tools (ADR 0007). Build them as clean parameterised queries and the chatbot is wiring; scatter them through page components and it is a rewrite.

---

## 5. The analysis engine

`packages/core/analysis` — pure functions, no I/O, no clock, no network. The densest tests in the repo.

```ts
normalize(text)                       → string             // NFC, lower, ACCENTS KEPT
tokenise(text)                        → Token[]            // splits clitics, keeps compounds
annotate(tokens, lemmas)              → AnnotatedToken[]   // dictionary in, stemmer fallback
countTerms(tokens, opts)              → TermCount[]
findMentions(tokens, topic)           → Mention[]          // n-gram and alias aware
stitchChunks(chunkResults)            → Utterance[]        // offset + concatenate
summarise(tokens, duration)           → Insight
```

The hard cases are acceptance criteria, therefore tests, not implementation detail:

| Case | Rule |
|---|---|
| `hotdog` / `hot dog` / `hot-dog` | One topic, three patterns. Matched on normalised n-grams with separators stripped, so all three count (D6). |
| `run` / `running` / `ran` | Same lemma, one term. Surface forms kept and shown, so the count is explicable (D4). |
| `don't` | One token, lemma `do not`. Never split into a stray `t` (D3). |
| `um`, `uh` | A separate filler class — excluded from top terms, but filler rate is a genuinely funny podcast stat in its own right (D2). |
| Phrase across a sentence boundary | Counts. ASR punctuation is too unreliable to respect; a rare false positive beats systematic false negatives (D8). |
| `e` vs `é`, `por` vs `pôr` | Different words, never merged. **Accents are preserved** through normalisation — the single most dangerous reflex to import from an English pipeline. |
| `diga-me`, `fazê-lo` | Split into verb + enclitic pronoun; the pronoun is a stop word, the verb is counted. |
| `guarda-chuva`, `segunda-feira` | Genuine compounds — hyphen kept, counted whole. |
| `falar` / `falei` / `falando` | One lemma via the dictionary. ~50 forms per verb makes this essential, not cosmetic. |
| `casa` vs `casar` | The stemmer would merge them. The dictionary does not. If a stemmed fallback ever merges them, `lemma_source` marks it heuristic and the UI shows the surface forms so the user can split them. |
| `pra` vs `para` | Whisper may transcribe either. A watchlist carries both as aliases (ADR 0006); a test pins the behaviour so it cannot drift silently. |
| English loanwords | Counted as transcribed, lemma falls back to the stemmer, marked heuristic. Code-switching is normal in Brazilian podcasts. |
| A word spanning a chunk join | Cannot happen: chunks are split on silence, never mid-word. Asserted by test. |
| Chunked vs single-pass timings | Must agree within tolerance. A property test compares both for the same audio — the guard on the riskiest code in the repo. |
| Same phrase twice in one utterance | Two mentions. We count occurrences, not utterances-containing (D1). |
| Low-confidence word | Counted, and the episode carries a quality score with a warning under 70 (D9). We never silently drop data, and never silently assert a shaky count. |

Determinism is a contract: the same transcript at the same `pipeline_version` must produce byte-identical counts. That is one property test, and it is what makes the numbers defensible.

---

## 6. Trust features, which are core and not polish

A count is worthless if the group doesn't believe it — and with friends, a wrong number gets *argued about*, which is actually the best possible QA.

1. **Every number is clickable** down to the list of mentions, and every mention seeks the audio to that millisecond. This is why word-level timestamps were a hard requirement on the transcription provider.
2. **Every count is explicable**: "312 mentions of *anyway*" expands to the surface forms that matched and the rule that grouped them.
3. **Low confidence is visible**, never hidden.

---

## 7. How this maps onto the layers

Per ADR 0016, the dependency rule is enforced in CI. Concretely, for the main flow:

| Layer | Component | Depends on |
|---|---|---|
| 4 Infrastructure | `app/api/episodes/[id]/process/route.ts` | the adapter below it, nothing else |
| 3 Adapter (controller) | `ProcessEpisodeController` — parses the request with a Zod contract, builds the request model, calls the use case, maps the response model to JSON | use case + contracts |
| 2 Use case | `ProcessEpisode` — orchestrates: fetch chunks, transcribe, stitch, look up lemmas, analyse, persist. Depends only on **port interfaces** | domain + ports |
| 2 Ports | `TranscriptionProvider`, `BlobStore`, `EpisodeRepository`, `TranscriptRepository`, `LemmaRepository`, `Clock`, `IdGenerator` — declared here, **owned here**, implemented outside | domain |
| 2 Analysis | `normalize`, `tokenise`, `annotate`, `countTerms`, `findMentions`, `stitchChunks` — pure, the lemma map passed in | domain |
| 1 Domain | `Episode`, `Transcript`, `Utterance`, `Term`, `Topic`, `Mention`, `Query` | nothing |
| 3 Adapter (gateways) | `GroqTranscriptionProvider`, `SupabaseBlobStore`, `DrizzleEpisodeRepository`, `DrizzleLemmaRepository` | the ports they implement |

Two things to notice, because they are the whole point:

1. **`ProcessEpisode` contains no vendor name.** Swapping Groq for anything else touches one gateway. That claim has been tested three times already.
2. **The lemma dictionary is a repository call in the use case, not inside `annotate`.** The use case does the one bulk query and hands `annotate` a plain map. That is why a dictionary-backed lemmatiser does not break the no-I/O rule, and why the analysis functions stay the easiest code here to test.

## 8. Deliberately absent

Live recording in the browser · realtime transcription · automatic topic discovery · **any speaker dimension** (ADR 0015) · sentiment · **any language but pt-BR** (ADR 0014) · video · teams and shared libraries · the AI assistant · exports beyond CSV.

Each is absent because the first increment does not need it to prove the idea — not because it is unimportant.
