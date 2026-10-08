# Tech Stack

**Status:** proposed, awaiting sign-off · **Owner:** engineering · **Last updated:** 2026-10-07

The one-line version: **a TypeScript monorepo — Next.js + Postgres + a background worker — with every external dependency (transcription, storage, LLM) hidden behind a port so it can be faked in tests and swapped in production.**

---

## 1. The decision that drives all the others

The instinctive choice for an audio-ML product is Python, because that is where Whisper, pyannote and spaCy live. We are not doing that, for one reason:

> **The MVP needs no machine learning of its own.** Transcription is bought from an API. The analysis — tokenise, lemmatise, drop stop words, count terms, match n-gram watchlists — is deterministic text processing that TypeScript does well.

So Python buys us nothing until we want *local* transcription, and costs us a second language, a second test runner, a second dependency manager, and an IPC boundary on day one. We defer it. When local transcription earns its place, it arrives as a sidecar behind the `TranscriptionProvider` port that already exists — an additive change, not a rewrite.

**Consequence:** one language, one test command, one type system from the database row to the chart axis.

---

## 2. The stack

| Layer | Choice | Why this one |
|---|---|---|
| Language | **TypeScript 5.x**, `strict: true` | Types across the whole seam: DB → API → UI. `strict` from commit one; retrofitting it never happens. |
| Runtime | **Node 22 LTS** | Already installed; native `fetch`, test runner, stable streams. |
| Monorepo | **pnpm workspaces + Turborepo** | Web and worker are separate processes but share the domain model. Turbo caches test/typecheck/build per package — the TDD loop stays fast as the repo grows. |
| Web framework | **Next.js 15**, App Router, React 19 | Server Components render analytics server-side where the data is; Route Handlers give us the API without a second deploy unit. |
| UI | **Tailwind CSS v4** + **shadcn/ui** (Radix) | "Nice UI" cheaply and accessibly. shadcn is copied-in source, not a dependency we fight — we own and restyle it. |
| Charts | **Recharts** for bars/lines/areas, **d3-scale + custom SVG** for the word cloud and the mention timeline | Recharts covers 80% in React idiom. The two bespoke visuals are the product's signature, so we hand-build them rather than bend a library. |
| Audio UI | **wavesurfer.js v7** | Waveform, region highlights, and click-a-word-to-seek — the feature that makes a count trustworthy, because the user can *hear* the mention. |
| Server state | **TanStack Query** | Upload progress and job polling are cache-invalidation problems; this is that tool. |
| Validation | **Zod** at every boundary | One schema becomes the runtime guard, the TS type, and the generated test fixture. |
| Database | **PostgreSQL 16** | See §3 — this is the load-bearing choice. |
| ORM | **Drizzle** | SQL-first, so analytics queries stay real SQL (`GROUP BY`, window functions, CTEs) instead of a query-builder cosplay. Migrations are plain checked-in SQL. Fast to run against a real DB in tests. |
| Jobs | **pg-boss** | Transcription takes minutes. pg-boss puts the queue *in Postgres* — no Redis, no second stateful service, transactional enqueue, and trivially inspectable in tests. |
| Blob storage | **Cloudflare R2** (S3 API), local filesystem adapter for dev | Audio never touches the app server: the browser uploads straight to R2 via a presigned URL. Kills the large-upload problem at the architecture level. R2 has no egress fees, which matters when users replay audio. |
| Transcription | **whisper.cpp + `large-v3-turbo`**, local and Metal-accelerated (ADR 0009); Deepgram available behind the same port | Word-level timestamps **and** speaker diarisation in one call, ~\$0.26/audio-hour (est.). Word timestamps are not a nice-to-have — they are what lets a count link back to a moment in the audio. The PM gates this on a two-provider bake-off over 5 real recordings scored on keyword recall (`../product/open-questions.md` Q2), which is the right way to choose; Deepgram is the favourite going in, not a fait accompli. |
| NLP | **wink-nlp** + `wink-eng-lite-web-model` | Tokeniser, sentence splitter, lemmatiser, POS, stop words, NER. Pure JS, no native build, and **deterministic** — the same input always yields the same count, which is the only way counting is testable or defensible to a user. |
| LLM (later) | **Anthropic SDK**, `claude-opus-5` | See §4. |
| Vectors (later) | **pgvector** + local `bge-small-en-v1.5` via transformers.js | Same database, no new service, no per-embedding cost. |
| Tests | **Vitest** (unit + integration), **Playwright** (E2E), **MSW** (HTTP fakes), Docker Postgres | See `testing-strategy.md`. |
| CI | **GitHub Actions** | typecheck → lint → unit → integration → build → E2E on every push. |
| Hosting | **Vercel** (web) + **Fly.io** (worker) + **Neon** (Postgres) + **R2** (blobs) | Each piece scales to zero; total idle cost ≈ \$0 while we are the only users. |

---

## 3. Why Postgres is the load-bearing choice

Postgres is picked not for the MVP but for the roadmap. It is the one component that serves every increment without being replaced:

| We will need | Postgres gives us | So we avoid |
|---|---|---|
| Relational transcript structure | tables, joins, FKs | — |
| "Find every utterance containing X" | `tsvector` + GIN full-text search | Elasticsearch |
| "Count mentions per week across the library" | `GROUP BY date_trunc`, window functions | an analytics warehouse |
| A job queue | pg-boss, same connection | Redis |
| Semantic topic search for the AI assistant | **pgvector** | Pinecone / Weaviate |
| Counting that is *exact* | SQL aggregates | trusting an LLM to count |

One stateful service for the entire roadmap. That is worth more than any individual component being marginally better.

---

## 4. The AI assistant, and the mistake we are not going to make

The future ask is *"how many times did they ever discuss hotdogs?"*. The reflex architecture is RAG: embed the transcripts, retrieve the top-k chunks, ask the LLM. **That architecture cannot answer this question.** Top-k retrieval sees a sample, so the LLM counts the sample — and confidently returns a wrong number. Worse, it returns a *plausible* wrong number, which is the most damaging failure a measurement product can have.

The right shape is **tool use over our own analytics API**:

```
user: "how many times did they ever discuss hotdogs?"
  → Claude calls  count_mentions({ term: "hotdog", scope: "all_time" })
  → our handler runs ONE SQL aggregate over the whole library
  → Claude phrases the exact number, cites the recordings, offers to play a clip
```

The LLM does language. SQL does arithmetic. Nothing is sampled, nothing is estimated, and the answer is reproducible.

Concretely:
- **Model:** `claude-opus-5` — 1M context, \$5/MTok in, \$25/MTok out, with `thinking: {type: "adaptive"}` and `output_config: {effort: "medium"}` for routine questions. `claude-haiku-4-5` (\$1/\$5) is the fallback for trivial reformulations if cost ever bites.
- **Loop:** the SDK's Tool Runner (`client.beta.messages.tool_runner` with `betaZodTool`) — our Zod schemas become the tool schemas, so the chatbot's contract is the same contract the API already validates.
- **Tools we expose:** `count_mentions`, `compare_terms`, `search_utterances`, `list_recordings`, `speaker_breakdown`, `trend_over_time`. Each one is a function the UI *already calls* — the chatbot is a second front end over the same analytics core, not a parallel implementation.
- **Prompt caching** on the system prompt + tool definitions (stable prefix) so follow-up questions in a session are cheap.
- **pgvector** earns its keep for the *fuzzy* half: "did they talk about food?" → embed, find semantically near terms already in the user's vocabulary, then hand those exact terms to `count_mentions`. Semantic search proposes; SQL counts.

The payoff for building it this way: **the chatbot requires no new data.** If the analytics core is a clean set of functions over a well-shaped schema, the assistant is roughly a system prompt plus tool wiring. That is the whole reason it can be deferred without regret.

---

## 5. Ports we define on day one

Each is an interface in `packages/core` with a `Fake` used by every test. This is what makes the suite fast, offline, and deterministic, and what makes vendor swaps boring.

| Port | Fake (tests) | Dev | Production |
|---|---|---|---|
| `TranscriptionProvider` | canned JSON fixtures | Deepgram (or fake) | Deepgram → later local Whisper |
| `BlobStore` | in-memory map | local filesystem | Cloudflare R2 |
| `Clock` | fixed instant | system | system |
| `IdGenerator` | counter | uuid v7 | uuid v7 |
| `JobQueue` | synchronous inline | pg-boss | pg-boss |
| `AssistantModel` (later) | scripted replies | Claude | Claude |

`Clock` and `IdGenerator` look like over-engineering for ten minutes, until the first snapshot test fails because a timestamp moved. Deterministic tests need deterministic time and IDs.

---

## 6. Repository layout

```
overtone/
├─ apps/
│  ├─ web/                  Next.js 15 — UI + Route Handlers
│  └─ worker/               Node process — consumes pg-boss, runs the pipeline
├─ packages/
│  ├─ core/                 domain + analysis engine. Pure. No I/O. Densest tests.
│  ├─ db/                   Drizzle schema, migrations, query helpers
│  ├─ contracts/            Zod schemas shared by web, worker and (later) the LLM tools
│  └─ ui/                   shared presentational components
├─ docs/
│  ├─ product/              PO + PM artifacts
│  ├─ architecture/         this directory
│  └─ adr/                  numbered decision records
└─ fixtures/                small committed audio clips + canned provider responses
```

`packages/core` is deliberately I/O-free. Tokenisation, lemmatisation, watchlist matching and aggregation are pure functions over plain data — the easiest code in the world to drive test-first, and where the product's actual value lives.

---

## 7. Alternatives considered and rejected

| Instead of | We rejected | Because |
|---|---|---|
| TS everywhere | Python/FastAPI backend | Right ecosystem for ML we are not yet doing; wrong cost for a solo dev shipping a web app. Revisit when local transcription lands. |
| Deepgram | OpenAI `whisper-1` | No diarisation, and a 25 MB limit forces us to write a chunk-and-stitch layer before we have a product. |
| Deepgram | AssemblyAI | Genuinely good, and ships topic detection, chapters and sentiment built in — which is precisely the problem. Those features *are* our product. We want excellent raw transcript and we want the insight layer to be ours. |
| Deepgram | local faster-whisper on day one | Free and private, but drags in Python, GPU variance and 10× slower turnaround during the increment where we most need a tight loop. Scheduled, not cancelled. |
| wink-nlp | spaCy (via Python) | Would reintroduce Python for work wink-nlp does in-process. |
| wink-nlp | an LLM for counting | Non-deterministic arithmetic in a product whose entire promise is an accurate count. No. |
| pg-boss | BullMQ + Redis | More throughput than we need, at the price of a second stateful service. Swap later if queue depth ever justifies it. |
| pg-boss | Trigger.dev / Inngest | Excellent DX for long jobs; adds a vendor and makes local offline testing harder. Reconsider if retry/observability becomes a real pain. |
| Postgres + pgvector | a dedicated vector DB | A second database to operate, back up and keep consistent, for a feature that is not in the MVP. |
| Presigned direct upload | upload through the app server | 100 MB+ bodies through a serverless function is a timeout and memory problem we can simply not have. |
| Drizzle | Prisma | Prisma's generated client fights the raw analytical SQL this product is made of. |
| Recharts | D3 from scratch | Too slow for standard charts. We still drop to D3 for the two bespoke visuals. |

---

## 8. Cost model (estimates — verify before committing)

**Marginal cost per audio hour: \$0.** Everything in the default configuration runs locally (ADR 0009).

| Concern | Default | Cost | If you ever want to pay for speed |
|---|---|---|---|
| Transcription | whisper.cpp, `large-v3-turbo`, Metal | \$0 | Deepgram ~\$0.26/audio-hr (est.) |
| Database | Postgres in Docker | \$0 | Neon free tier, then paid |
| Blob storage | filesystem adapter | \$0 | R2, <\$0.01/recording/month |
| Queue | pg-boss, in that Postgres | \$0 | — |
| Hosting | `localhost` | \$0 | Vercel + Fly.io |
| Assistant (M5) | Ollama, small local model | \$0 | `claude-opus-5`, ~\$0.02–0.04/question |

Fixed cost is one `brew install whisper.cpp ffmpeg` plus a model download (~0.5–1.6 GB, gitignored).

What we pay instead of money is **time**: an estimated 10–15× realtime on an M1 Pro, so a 60-minute recording takes roughly 4–6 minutes. ⚠️ Estimate — M0 benchmarks it. For a personal archive that is the right trade, and it makes M1's async queue more valuable rather than less.

---

## 9. Open items for the stakeholder

The full register with options, trade-offs and owners is `../product/open-questions.md` (Q1–Q12). These five are the ones that touch the **stack** specifically — only #2 can change it structurally.

| # | Question | Default if you don't care |
|---|---|---|
| 1 | Single-user (no login) for the MVP, or multi-user auth from day one? | Single-user. Auth is a whole increment; adding it later costs one migration if `user_id` is in the schema from the start — which it will be. |
| 1b | ~~What monthly budget?~~ | **Resolved — ADR 0009.** \$0 marginal. No spend alert, budget ceiling or kill switch in M0 scope. |
| 2 | ~~Is sending audio to a third-party ASR vendor acceptable?~~ | **Resolved — ADR 0009.** Audio never leaves the machine by default. It turned out not to cost us Python, so ADR 0002 survives too. |
| 3 | English-only for the MVP? | Yes. Lemmatisation and stop words are per-language; each additional language is real work. |
| 4 | Ceilings on file size and duration? | **Settled by the PO/PM:** 200 MB / 120 min, widening per increment (M0 holds 25 MB / 10 min to keep the first ASR bill under \$1). Defined once in `../product/backlog.md`; code reads it from one constant. |
| 5 | Deploy to the cloud, or run locally for now? | Build cloud-ready, run locally until there is a second user. Note the PM makes a deployed URL a **non-negotiable M0 exit criterion** — so this needs a hosting budget (Q7) before the first increment, not after. |
| 6 | **PO and PM disagree here:** retain source audio indefinitely, or purge it 30 days after processing? | No default — this one genuinely needs you. The PO wants retention because playback is what makes a count believable; the PM wants a 30-day purge because stored recordings of real people are the largest risk on the register. Both are right. A per-recording "keep audio" opt-in with a 30-day default purge is the compromise, and it is already modelled (domain decision D12 separates *purge audio* from *delete recording*). |
