# Tech Stack

**Status:** settled · **Last updated:** 2026-10-07 · **Decided in:** ADR 0010

The one-line version: **one Next.js app on Vercel's free tier, Supabase for database + files + logins, and Groq for transcription. No server to run, no credit card, $0 a month.**

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
| Transcription | **Groq**, `whisper-large-v3-turbo` | Free, fast enough to remove the queue, and returns **word-level timestamps**. No diarisation — see §4. |
| Analysis | **wink-nlp** + `wink-eng-lite-web-model` | Tokeniser, lemmatiser, POS, stop words. Pure JS, no native build, and **deterministic** — the same episode always yields the same counts. |
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

### "Who talks most" with no diarisation

Groq's Whisper does not separate speakers, and that is a signature podcast stat.

**The obvious answer — transcribe one file per host — is wrong, and ADR 0011 explains why.** Every host's mic picks up the others faintly, Whisper transcribes that bleed, and the same sentence lands in two or three transcripts. Counts inflate. It also costs 3 × 2 = 6 audio-hours for one episode against a 2-hour hourly allowance.

What we do instead: **transcribe the mixed file once** for the authoritative word list, then use each host's individual track for **audio energy only** — an RMS envelope computed in the browser with no model and no API call. Each word in the master transcript is attributed to whichever host's track is loudest across its time span.

Cheaper (one request, not N), exact rather than statistical, and immune to bleed — bleed is precisely *why* it works, since the host actually talking is always loudest on their own mic. No per-host tracks? No speaker breakdown, and the UI says so rather than guessing.

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

`JobQueue` was a planned port and has been **deleted**. With no background execution there will never be a second implementation, and a port with one implementation is just indirection.

---

## 6. Repository layout

```
overtone/
├─ app/                    Next.js App Router — pages + API routes
├─ packages/
│  ├─ core/                domain + analysis engine. Pure. No I/O. Densest tests.
│  ├─ db/                  Drizzle schema + migrations
│  └─ contracts/           Zod schemas, shared with the assistant's tools later
├─ docs/
└─ fixtures/               small audio clips + canned Groq responses
```

One app, three packages. `packages/core` stays I/O-free: tokenising, lemmatising, watchlist matching and aggregation are pure functions over plain data — trivial to drive test-first, and where the product's actual value lives.

---

## 7. Rejected, and why

| Instead of | Rejected | Because |
|---|---|---|
| Groq | Deepgram (~\$0.26/audio-hr) | Costs money and needs a card. Was ADR 0004; reversed twice. |
| Groq | Local whisper.cpp | Free, but needs the laptop running and a C++ toolchain the stakeholder doesn't want. Was ADR 0009. |
| Groq | OpenAI `whisper-1` | Same 25 MB cap, but not free. |
| Supabase | Neon + Cloudflare R2 + Clerk | Three services and three free tiers to track, versus one. Neon's no-pause behaviour is nicer, but not nicer enough. |
| No queue | pg-boss / Inngest | Transcription takes ~10 s. A queue for a 10-second operation is infrastructure built for a problem we measured and don't have. |
| Multi-track | pyannote diarisation | Needs Python, a GPU and a HuggingFace token, and is *still* confidently wrong on crosstalk. Multi-track is free and exact. |
| wink-nlp | spaCy via Python | Reintroduces Python for work wink-nlp does in-process. |
| wink-nlp | an LLM for counting | Non-deterministic arithmetic in a product whose promise is an accurate count. See ADR 0007. |
| Drizzle | Prisma | Its generated client fights the raw analytical SQL this product is made of. |
| Signed upload URLs | upload through the API route | 25 MB bodies through a serverless function is a memory and timeout problem we can simply not have. |

---

## 8. Still open

Very little. Everything structural is settled in `docs/adr/`.

| # | Question | Default if you don't care |
|---|---|---|
| 1 | Do you record multi-track (a file per host), or one mixed file? | Build multi-track; it's the only way to get "who talks most" and the upload flow barely changes. Mixed files still work, just without speakers. |
| 2 | Roughly how long are your episodes? | Assume 60–90 min, so browser-side compression ships in the first increment rather than later. |
| 3 | Keep every episode's audio forever, or drop it after a while? | Keep it — playback is what makes a count believable. 1 GB is ~40 episodes, so revisit when it fills. |
