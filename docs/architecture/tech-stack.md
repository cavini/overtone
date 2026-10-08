# Tech Stack

**Status:** settled · **Last updated:** 2026-10-07 · **Decided in:** ADR 0010

The one-line version: **one Next.js app on Vercel's free tier, Supabase for database + files + logins, and Groq for transcription of Brazilian Portuguese audio. No server to run, no credit card, $0 a month.** Layered per Clean Architecture, with the dependency rule enforced in CI (ADR 0016).

---

## 1. The decision everything else follows from

Groq runs `whisper-large-v3-turbo` at roughly **160× realtime**. A 25-minute episode comes back in about ten seconds. Vercel gives a function 300 seconds.

Transcription therefore **fits inside a normal web request**, with an order of magnitude to spare. That one fact deletes the worker process, the job queue, Docker, local Postgres, retry machinery and stuck-job monitoring. What was planned as a three-week increment of pipeline infrastructure stopped existing.

The app is one deployable thing. You push to git; Vercel deploys it.

---

## 2. The stack

| Layer | Choice | Why this one |
|---|---|---|
| Language | **TypeScript 5.x**, `strict: true` | Types from the database row to the chart axis. Strict from the first commit. |
| Framework | **Next.js 15**, App Router, React 19 | One deployable unit: UI, API routes and server rendering. Vercel's native target, so deployment is `git push`. |
| Hosting | **Vercel Hobby** | Free forever, no card, a real URL your friends can visit, preview deploys per branch. Non-commercial only — fine for this. |
| UI | **Tailwind CSS v4** + **shadcn/ui** | A good-looking, accessible UI quickly. shadcn is copied-in source we own and restyle, not a dependency to fight. |
| Charts | **Recharts**, plus custom SVG for the word cloud and the episode timeline | Recharts covers the standard charts; the two signature visuals are worth hand-building. |
| Audio | **wavesurfer.js v7** | Waveform plus click-a-word-to-seek. The feature that makes a count believable, because you can hear the moment. |
| Database | **Supabase Postgres** (500 MB free) | Real Postgres: joins, `GROUP BY`, full-text search, and `pgvector` already available for later. |
| ORM | **Drizzle** | SQL-first, so the cross-episode analytics stay real SQL. Migrations are checked-in SQL files. |
| File storage | **Supabase Storage** (1 GB free) | Signed upload URLs, so audio goes browser → storage without passing through our functions. |
| Auth | **Supabase Auth**, magic link | Friends get an email link, no passwords to manage. 50 000 monthly users free. |
| Transcription | **Groq**, `whisper-large-v3-turbo`, `language: "pt"` | Free, fast enough to remove the queue, and returns **word-level timestamps**. Language is set explicitly, never auto-detected. |
| Analysis | **our own pt-BR pipeline** — NFC normaliser, clitic-aware tokeniser, a `lemmas` dictionary table, Snowball `pt` stemmer fallback, pt-BR stop-word list | `wink-nlp` was the plan and is **out**: its lemmatiser and stop words are English-only and have no Portuguese equivalent (ADR 0014). Still pure JS, no native build, and **deterministic** — the same episode always yields the same counts. |
| Architecture | **Clean Architecture** layers + `dependency-cruiser` in CI | The dependency rule is a failed build, not a code-review conversation (ADR 0016). |
| Validation | **Zod** at every boundary | One schema is the runtime guard, the TS type, and the test fixture. |
| Assistant (later) | Groq's free LLMs, or Claude API | It only translates a question into a `Query` — it never counts. See ADR 0007. |
| Tests | **Vitest** + **Playwright** + **MSW** | Whole suite offline and free, because every external service has a fake. |
| CI | **GitHub Actions** | typecheck → lint → test → build on every push. |

**Three services, all free, none needing a card.** Supabase is doing the work of three (database, blob storage, auth), which is most of why the stack is this small.

---

## 3. What it costs

**$0/month.** Not "cheap" — zero.

| Service | Free tier | What binds first |
|---|---|---|
| Groq | 8 hrs audio/day · 20 req/min · **25 MB/file** | The 25 MB cap, immediately — see §4 |
| Vercel Hobby | 1 M invocations · 300 s/function · 100 GB transfer | Nothing, at friends-scale |
| Supabase | 500 MB DB · **1 GB files** · 50 k users | Storage, at roughly 40 compressed episodes |

**Episodes are 1h40–2h, so here is what that actually means.** Every number below is defined once in `../product/backlog.md`; code reads them from one constants module rather than restating them.

| | A 2-hour episode |
|---|---|
| As 16 kHz mono Opus | ~21 MB — fits the 25 MB cap, but we chunk anyway (ADR 0011) |
| Audio-seconds consumed | 7 200 — **the entire hourly allowance** |
| So, throughput | **one episode per hour, four per day** |
| Transcription wall-clock | tens of seconds, with chunks running in parallel |
| Storage per episode | ~22 MB → **1 GB ≈ 37 episodes** |
| Back catalogue of 50 episodes | 100 audio-hours ≈ **two weeks** of backfilling |

A weekly show is comfortable. **Storage is the ceiling that arrives first**, not money, not compute, not rate limits.

Two gotchas worth knowing up front: a free Supabase project **pauses after 7 idle days** (a once-daily Vercel Cron ping prevents it), and Vercel Hobby is **non-commercial** (if this ever makes money, it needs a paid plan).

---

## 4. The two podcast-specific problems

### Two-hour episodes

Whisper downsamples everything to 16 kHz mono anyway, so anything above that is wasted bytes. At 16 kHz mono **Opus** (Groq accepts `ogg`/`webm`), a 2-hour episode is ~21 MB — under the cap. But we chunk regardless:

**The browser decodes the episode, splits it into ~20–25 minute pieces on silence boundaries, encodes each to Opus, and uploads them separately. The server transcribes the chunks in parallel and stitches the word timestamps with offsets.**

Chunking is not a workaround for the size cap — it is what keeps the **no-worker** architecture viable. Four chunks in parallel finish in roughly the time of the slowest, so the whole pipeline stays inside Vercel's 300 s. A single serial 2-hour request might not, and we would be forced to build a queue. It also means one failed chunk costs one chunk, not two hours against a daily cap of four episodes.

Splitting **on silence** is the correctness-critical part: a cut through the middle of a word produces two garbage fragments and corrupts the counts at the join. And the timestamp offsetting is the highest-risk code in the repo — an off-by-one doesn't crash, it silently points every subsequent count at the wrong moment. Property tests compare a chunked transcript against a single-pass transcript of the same audio.

### Brazilian Portuguese

The show is recorded in pt-BR, which is why `wink-nlp` is gone and we own the text pipeline. Portuguese makes the analysis harder exactly where this product is sensitive:

| | |
|---|---|
| **Diacritics are semantic** | `e`/`é` (and / is), `por`/`pôr`, `esta`/`está`. Stripping accents — the English reflex — silently merges unrelated words. **Hard rule with a test: accents are preserved.** |
| **~50 verb forms per lemma** | `falar, falo, falei, falava, falando, falado…`. Lemma grouping is essential, not a nicety. |
| **Enclitic pronouns use hyphens** | `diga-me`, `fazê-lo` must split; `guarda-chuva`, `segunda-feira` must not. A clitic-suffix list separates them. |
| **Stemmers over-merge** | `casa` (house) and `casar` (to marry) both stem to `cas`; `comer` stems to `com`, colliding with the preposition. So we look up a **dictionary first** and stem only for out-of-vocabulary words — names, slang, in-jokes — marking those as heuristic. |
| **Whisper writes standard orthography** | Spoken `pra`, `tá`, `né` may come back as `para`, `está`, `não é`. A count can depend on the transcriber's spelling choices. The answer is a product one: a running joke's watchlist carries both variants as aliases, which ADR 0006's design already supports. |

The lemma dictionary lives in a Postgres table and is fetched with **one bulk query per episode** over that episode's ~3–5k distinct forms, then passed *into* the pure analysis functions — so `packages/core` keeps its no-I/O rule (ADR 0016).

### No speaker breakdown

Only the final edited file is uploaded, so there are no per-host tracks and no free service that diarises. **"Who talks most" is cut, not deferred** (ADR 0015).

One honest consequence of the audio being post-edit: counts describe **the published episode — what listeners heard** — not the raw conversation. Arguably the more meaningful number for a podcast, but it means filler and pace metrics measure *the edit*, and we will not present them as anyone's speech habits.

---

## 5. Ports

Each is an interface in `packages/core` with a `Fake` used by every test. This is why three vendor reversals in one planning session cost one adapter each.

| Port | Fake (tests) | Production |
|---|---|---|
| `TranscriptionProvider` | canned Groq JSON fixtures | Groq |
| `BlobStore` | in-memory map | Supabase Storage |
| `Clock` | fixed instant | system |
| `IdGenerator` | counter | uuid v7 |
| `AssistantModel` (later) | scripted replies | Groq / Claude |

Every port has **one shared contract test suite that runs against every implementation**, fake included (ADR 0016, Liskov). This matters more here than anywhere else: the whole suite trusts the fakes, so if a fake can do something the real adapter cannot, every test passes for the wrong reason.

Note that `LemmaLookup` is **not** a port — it is a plain map passed as a parameter into pure functions, so the dictionary query happens in an adapter and `core` stays I/O-free.

`JobQueue` was a planned port and has been **deleted**. With no background execution there will never be a second implementation, and a port with one implementation is just indirection.

---

## 6. Repository layout

```
overtone/
├─ app/                        4. infrastructure — Next.js routes, React pages
├─ packages/
│  ├─ core/
│  │  ├─ domain/               1. entities: Episode, Series, Transcript,
│  │  │                           Segment, Term, Topic, Mention, Query
│  │  │                           pure data + invariants, ZERO dependencies
│  │  ├─ usecases/             2. ProcessEpisode, AnalyzeTranscript,
│  │  │                           GetSeriesOverview, CreateTopic, ShareEpisode
│  │  ├─ ports/                2. interfaces, OWNED BY THE INNER LAYER
│  │  └─ analysis/             2. the pt-BR pipeline. Pure functions.
│  ├─ adapters/                3. route handlers, repositories, gateways,
│  │                              presenters. Vendor SDKs live only here.
│  ├─ db/                      3. Drizzle schema + migrations + lemma seed
│  └─ contracts/               Zod schemas at every boundary
├─ docs/
└─ fixtures/                   audio clips + canned Groq responses
```

Folders are named for the **domain**, not for patterns — `episodes/`, `series/`, `topics/`, `analysis/`, never `services/` or `utils/`. Opening the repo should show what the app does, not which framework renders it.

`core` is I/O-free and framework-free: no `next`, no `react`, no `drizzle-orm`, no `@supabase/*`, no `groq-sdk`, and no `new Date()` or `Math.random()` — those arrive through the `Clock` and `IdGenerator` ports. **`dependency-cruiser` fails the build on violation**, because an architecture that only lives in a document decays within a week.

---

## 7. Rejected, and why

| Instead of | Rejected | Because |
|---|---|---|
| Groq | Deepgram (~\$0.26/audio-hr) | Costs money and needs a card. Was ADR 0004; reversed twice. |
| Groq | Local whisper.cpp | Free, but needs the laptop running and a C++ toolchain the stakeholder doesn't want. Was ADR 0009. |
| Groq | OpenAI `whisper-1` | Same 25 MB cap, but not free. |
| Supabase | Neon + Cloudflare R2 + Clerk | Three services and three free tiers to track, versus one. Neon's no-pause behaviour is nicer, but not nicer enough. |
| No queue | pg-boss / Inngest | Transcription takes ~10 s. A queue for a 10-second operation is infrastructure built for a problem we measured and don't have. |

| our own pt-BR pipeline | **wink-nlp** | Was the plan. Its lemmatiser, POS tagger and stop words are English-only, and the show is in Brazilian Portuguese (ADR 0014). |
| dictionary-first lemmas | stemming alone | Portuguese Snowball folds `comer` into `com`, turning a common verb into a preposition and a stop word into a top term. A silent false merge is the one failure this product cannot tolerate. |
| preserving diacritics | stripping accents | Merges `e`/`é` and `por`/`pôr`. Standard in English pipelines, catastrophic here. |
| no speaker breakdown | energy attribution over host tracks | Was ADR 0011 and was good — but only the final edited file is uploaded, so the per-host signal does not exist (ADR 0015). |
| no speaker breakdown | paid diarisation | Costs money and is confidently wrong on crosstalk, which is most of a podcast. |
| pt-BR lemmas | spaCy / Stanza via Python | Reintroduces Python for work a dictionary lookup plus a stemmer does in-process. |
| wink-nlp | an LLM for counting | Non-deterministic arithmetic in a product whose promise is an accurate count. See ADR 0007. |
| Drizzle | Prisma | Its generated client fights the raw analytical SQL this product is made of. |
| Signed upload URLs | upload through the API route | 25 MB bodies through a serverless function is a memory and timeout problem we can simply not have. |

---

## 8. Still open

Almost nothing. Everything structural is settled in `docs/adr/`, and the three questions that were here are now answered.

| # | Question | Status |
|---|---|---|
| 1 | ~~Multi-track, or one mixed file?~~ | **Answered: one final edited file.** Speaker breakdown cut — ADR 0015. |
| 2 | ~~How long are your episodes?~~ | **Answered: 1h40–2h.** Chunking is first-class — ADR 0011. |
| 3 | ~~Keep the audio forever?~~ | **Resolved:** keep recent, auto-purge oldest, counts live forever — ADR 0013. |
| 4 | ~~English or another language?~~ | **Answered: Brazilian Portuguese.** Own pipeline, `wink-nlp` out — ADR 0014. |
| 5 | Which pt-BR form→lemma list, under what licence? | **Open.** Pick at M1 and verify the licence before it ships — ⚠️ flagged in ADR 0014. The only genuinely open technical choice left. |
