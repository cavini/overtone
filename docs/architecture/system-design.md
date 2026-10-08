# System Design

**Status:** proposed · **Companion to:** `tech-stack.md`, `../product/glossary-and-domain.md`

---

## 1. System context

```
   ┌──────────┐   presigned PUT    ┌──────────────┐
   │ Browser  │ ─────────────────► │ Cloudflare   │
   │ (Next.js)│                    │ R2  (audio)  │
   └────┬─────┘                    └──────┬───────┘
        │ REST (/api/*)                   │ GET (stream for playback)
        ▼                                 │
   ┌──────────────────┐                   │
   │ Next.js server   │                   │
   │ Route Handlers   │                   │
   └────┬────────┬────┘                   │
        │        │ enqueue                │
        │        ▼                        │
        │   ┌──────────────────┐          │
        │   │ Postgres         │          │
        │   │ · domain tables  │          │
        │   │ · pg-boss queue  │          │
        │   │ · tsvector / FTS │          │
        │   │ · pgvector (v2)  │          │
        │   └────────┬─────────┘          │
        │            │ claim job          │
        │            ▼                    │
        │   ┌──────────────────┐          │
        └──►│ Worker (Node)    │◄─────────┘
            │ transcribe →     │
            │ analyse → store  │
            └────────┬─────────┘
                     │ HTTPS
                     ▼
            ┌──────────────────┐
            │ whisper.cpp      │   local subprocess, $0
            │ (Metal, on-device)│   cloud adapter optional
            └──────────────────┘
```

Only two long-lived processes (`web`, `worker`) and one stateful service (Postgres). Everything else is a bucket or someone else's API.

---

## 2. The pipeline

A `Recording` moves through an explicit state machine. The state is a column, not an inference — the UI reads it directly, and every transition is a tested function.

```
uploaded ──► transcribing ──► analyzing ──► ready ──► deleting
   │              │               │
   └──────────────┴───────────────┴──► failed ──► (retry) ──► uploaded
```

These six strings — `uploaded`, `transcribing`, `analyzing`, `ready`, `failed`, `deleting` — are the canonical set from `../product/glossary-and-domain.md`. Tests assert on them literally, so they are spelled American-style (`analyzing`) and never paraphrased in code, API responses or UI copy.

| Stage | Who | Does |
|---|---|---|
| *(pre-row)* | browser | PUTs bytes straight to R2 against a presigned URL. The server never sees the audio. The row exists but is not yet `uploaded`. |
| `uploaded` | web | Client confirms the upload; server probes real duration/format from the blob, validates against the ceiling, enqueues `transcribe`. |
| `transcribing` | worker | Calls `TranscriptionProvider` — by default `ffmpeg` to 16 kHz mono WAV, then `whisper-cli` as a subprocess (ADR 0009). Stores the raw provider response verbatim in `transcripts.raw_provider_payload`, then normalises it into `utterances` + `tokens`. Enqueues `analyze`. |
| `analyzing` | worker | Runs the pure analysis engine: normalize → lemmatise → classify stop words and fillers → term frequency → n-gram watchlist matches → speaker stats. |
| `ready` | worker | Writes `insights` + `term_counts` + `mentions`. The UI has everything it needs. |
| `failed` | any | Records a typed `failure_reason` and a user-facing message. Retryable without re-uploading. |
| `deleting` | web | Deletion in progress: row and blob are being removed. A terminal, user-visible state because blob deletion can lag. |

**At M0 there is no queue.** The `JobQueue` port's synchronous implementation runs both stages inline in the request, which is why the walking skeleton can ship in a week (see `../product/roadmap.md`). pg-boss arrives at M1 when 120-minute files make background execution unavoidable. The state machine above is identical either way — only who advances it changes. This is the whole return on defining the port on day one.

**Three properties this shape buys us, each worth a test:**

1. **Re-analysis without re-transcription.** The expensive, paid, non-deterministic step (transcription) is stored raw and separately from the cheap, free, deterministic step (analysis). When we improve the analyser — a better lemmatiser, a new stop-word policy, a fixed n-gram bug — we re-run `analyse` over the existing transcripts at zero cost. During MVP development this will happen constantly, so we design for it on day one.
2. **Idempotency.** Every job carries the recording id and a `pipeline_version`. Re-running a completed stage is a no-op unless the version changed. Retries and at-least-once delivery therefore cannot corrupt counts.
3. **Honest progress.** The user watching a spinner can be told which stage they are in and roughly how long it takes — the single biggest UX risk in the whole product (see the PM's risk register).

---

## 3. Data model

Shape, not final DDL. Drizzle schema in `packages/db/schema.ts` is the source of truth.

```
users(id, email, created_at)
   └─ recordings(id, user_id, title, original_filename, mime_type,
                 byte_size, duration_ms, blob_key, language,
                 status, failure_reason, pipeline_version,
                 created_at, processed_at)
        ├─ transcripts(id, recording_id, provider, provider_model,
        │              raw_provider_payload jsonb, full_text,
        │              quality_score, normalization_version, created_at)
        │    ├─ utterances(id, transcript_id, speaker_id, start_ms, end_ms,
        │    │             text, tsv tsvector)   -- one continuous speaker turn
        │    └─ tokens(id, transcript_id, utterance_id, position,
        │              surface, normalized, lemma,
        │              token_class,              -- word | stopword | filler
        │              start_ms, end_ms, confidence)
        ├─ speakers(id, recording_id, provider_label, display_name,
        │           total_speaking_ms, word_count)
        ├─ insights(id, recording_id, pipeline_version,
        │           word_count, unique_word_count, duration_ms,
        │           words_per_minute, computed_at)
        ├─ term_counts(id, recording_id, lemma, surface_forms text[],
        │              count, speaker_breakdown jsonb)
        └─ mentions(id, recording_id, topic_id, segment_id, word_position,
                    matched_text, start_ms, end_ms)

topics(id, user_id, name, color, created_at)          -- the watchlist
   └─ topic_terms(id, topic_id, pattern, match_key)   -- 'hotdog' | 'hot dog' | 'hot-dog'

queries(id, user_id, name, spec jsonb, created_at)   -- a saved question
```

`queries.spec` holds the `Query` object from the domain model: `{ terms | topics, recordingFilter, dateRange, speakerFilter, groupBy, metric }`. The dashboard builds one per view; the future assistant compiles natural language into one. **Both execute through the same engine** — which is the structural guarantee that chat and dashboard can never report different numbers (domain decision D11).

Decisions worth stating, because they are the ones that are expensive to change:

- **`tokens` is a real table, not a JSON blob.** It is the biggest table by far (~10k rows/audio hour) and the temptation is to keep it as JSON on the transcript. We don't, because every interesting query — per-term counts, per-speaker counts, mention timelines, "jump to 14:32" — is an aggregate over tokens with timestamps. In SQL that is trivial; in application code over JSON it is a loop we would write five times. Partition or roll up later if size ever hurts.
- **All three forms are stored: `surface`, `normalized`, `lemma`.** Per domain decision D4 the default view is lemma-grouped (`run` 14, expandable to `run 6 / running 5 / ran 3`) with an "exact words" toggle. Storing all three makes that toggle a pure display concern rather than a re-analysis, and costs nothing.
- **`token_class` separates stop words from fillers.** Both are excluded from the default top-terms view, but `um`/`uh` are a *filler* class because filler rate is itself an insight for the podcaster persona, while `the` is simply noise. Nothing is dropped at index time — a stop word named explicitly in a topic is always counted (D5).
- **`term_counts` is a materialised result, not a view.** Precomputed at `analyse` time, invalidated by `pipeline_version`. The library-wide "ever" query the AI assistant will ask is then one indexed `SUM` over this table rather than a scan over hundreds of millions of words.
- **`user_id` exists from the first migration** even while the MVP is single-user. This is the difference between "add auth" being a feature and being a migration.
- **`raw_provider_payload` is never thrown away.** It is our ability to re-derive everything, to switch providers and compare, and to debug a wrong count without paying for transcription twice.
- **`topics` are user-defined term watchlists** (see the PO's domain doc). A "topic" is a named group of surface patterns the user cares about. Deterministic, explainable, instantly correctable by the user when it gets something wrong — and it makes "how many times did we discuss X" answerable exactly. Machine topic *discovery* arrives later as a suggestion engine that proposes watchlists, never as the counting mechanism.

---

## 4. API surface (MVP)

Next.js Route Handlers. Every request and response body is a Zod schema in `packages/contracts`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/recordings` | Create a recording row, return `{ id, uploadUrl }` presigned for R2 |
| `POST` | `/api/recordings/:id/complete` | Client signals upload done → validate, probe, enqueue |
| `GET` | `/api/recordings` | Library list with status and headline stats |
| `GET` | `/api/recordings/:id` | Detail: insights, top terms, speakers, mentions |
| `GET` | `/api/recordings/:id/transcript` | Paged segments for the transcript reader |
| `GET` | `/api/recordings/:id/status` | Poll target while processing |
| `DELETE` | `/api/recordings/:id` | Hard-delete row **and** blob (a privacy guarantee, so it gets its own test) |
| `POST` | `/api/recordings/:id/reprocess` | Re-run analysis at the current `pipeline_version` |
| `GET` | `/api/topics` · `POST` `/api/topics` · `PATCH`/`DELETE` `/api/topics/:id` | Manage watchlists |
| `GET` | `/api/analytics/mentions?topicId=&from=&to=` | Cross-library counts — **the endpoint the AI assistant will later call as a tool** |

That last row is the hinge. Build the analytics endpoints as clean, parameterised, well-tested functions and the chatbot is wiring. Build them as bespoke queries scattered through React Server Components and the chatbot becomes a rewrite.

---

## 5. The analysis engine

`packages/core/analysis` — pure functions, no I/O, no clock, no network. The densest tests in the repo live here.

```ts
tokenise(text)                          → Token[]            // surface, offset, sentence index
annotate(tokens)                        → AnnotatedToken[]   // + lemma, POS, isStopword
countTerms(tokens, opts)                → TermCount[]        // frequency, stop words excluded
findMentions(tokens, topic)             → Mention[]          // n-gram aware, alias aware
speakerStats(segments, words)           → SpeakerStat[]      // share of talk, WPM
summarise(words, segments, duration)    → Insight
```

The hard cases are specified as acceptance criteria and therefore as tests, not left to the implementation:

| Case | Rule |
|---|---|
| `"hotdog"` / `"hot dog"` / `"hot-dog"` | One topic, three patterns. Matching runs on normalised n-grams, so all three count. |
| `"run"` / `"running"` / `"ran"` | Same lemma → one term. Surface forms kept in `term_counts.surface_forms` and shown in the UI, so the count is explicable. |
| `"don't"` | One token, lemma `do not`. Never split into a mysterious `"t"`. |
| `"the"`, `"um"`, `"uh"` | Stop words and fillers excluded from "top words", but still counted in `word_count` and available behind a toggle. Filler frequency is itself an insight for the podcaster persona. |
| Phrase spanning a sentence boundary | Does **not** count. A mention must be contiguous within one utterance. |
| Low-confidence word (< 0.5) | Counted, but the mention is flagged `uncertain` in the UI. We never silently drop data, and we never silently assert a shaky count. |
| Same phrase twice in one utterance | Two mentions. Counts are of occurrences, not of utterances-containing. |

Determinism is a contract: the same transcript and the same `pipeline_version` must always produce byte-identical counts. That is one property test, and it protects the product's credibility.

---

## 6. Trust features (not polish — core)

Counting is only valuable if the user believes the count. Three things make it believable, and they are cheap only if designed in early:

1. **Every number is clickable.** A count drills into the list of mentions; a mention seeks the audio to that millisecond. This is why we store word-level timestamps.
2. **Every count is explicable.** "42 mentions of *hotdog*" expands to the surface forms that matched and the rule that grouped them.
3. **Low confidence is visible, never hidden.** A transcript region the provider was unsure about is marked as such in the reader.

---

## 7. What is deliberately absent from the MVP

Real-time/streaming transcription · live recording in the browser · multi-tenant orgs and sharing · the AI assistant · automatic topic discovery · sentiment · non-English · video containers · exports beyond CSV/JSON · mobile apps.

Each is absent because the walking skeleton does not need it to prove the idea, not because it is unimportant.
