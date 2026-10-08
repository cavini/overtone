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

The real limits are **storage** and **file size**, not money or compute. Plan against those.

Two gotchas worth knowing up front: a free Supabase project **pauses after 7 idle days** (a once-daily Vercel Cron ping prevents it), and Vercel Hobby is **non-commercial** (if this ever makes money, it needs a paid plan).

---

## 4. The two podcast-specific problems

### Episodes are longer than 25 MB

Groq caps uploads at 25 MB. Podcast episodes are routinely 60–90 minutes, which is far over at normal bitrates. Three steps, in order:

1. **Compress in the browser** to ~64 kbps mono before upload. Speech needs nothing more, and it fits roughly 50 minutes in 25 MB. This alone covers most episodes.
2. **Chunk and stitch** beyond that: split on silence, transcribe each piece, offset the timestamps, concatenate. Mechanical but genuinely fiddly — it gets real tests, because an off-by-one in a timestamp offset silently corrupts every count after the join.
3. **Refuse clearly** if it still does not fit, naming the actual numbers and what to do about it.

### "Who talks most" with no diarisation

Groq's Whisper does not separate speakers, and that is a signature podcast stat. The answer is **multi-track upload**: one audio file per host — exactly how anyone recording in Riverside, Zencastr or on separate mics already has their files. Each track is transcribed independently and tagged with its host, giving **perfect speaker attribution with zero diarisation** and better accuracy per track as a bonus.

A single mixed file simply gets no speaker breakdown, and the UI says so rather than guessing. This is a case where the free constraint pushed us toward a *better* design than the paid one: multi-track beats statistical diarisation on accuracy, and cannot be confidently wrong.

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
