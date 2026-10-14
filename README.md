# Overtone

Analytics for the Brazilian Portuguese podcast you record with your friends.

Upload each episode. Overtone transcribes it and tells you how often the running jokes actually came up, which words you can't stop saying, and how all of it is changing **across the series** — with a timestamped quote behind every single number.

> *Overtone* — in acoustics, the harmonics stacked above a fundamental: the part of a sound you don't consciously hear. In speech, the themes running underneath what was actually said. Both are the product.

---

## It costs nothing to run

Three services, all free tiers, **no credit card anywhere**:

| | Service | Free tier |
|---|---|---|
| Transcription | **Groq** · `whisper-large-v3-turbo` | 8 hrs audio/day · word-level timestamps · 25 MB/file |
| Hosting | **Vercel Hobby** | Free forever · a real URL · 5-min functions |
| Database, files, logins | **Supabase** | 500 MB Postgres · 1 GB files · magic-link auth |

Nothing runs on your machine. Your friends sign in with an email link and use it from anywhere.

The reason this works: Groq transcribes at roughly **160× realtime**, so an episode comes back in about ten seconds — inside a normal web request. That means no background worker, no job queue, no Docker, and nothing to keep alive. See [`ADR 0010`](docs/adr/0010-free-hosted-stack-no-worker.md).

## The idea

Transcription is a commodity and summarisation is crowded. What a podcast actually wants is **trustworthy counting**: *we've said "anyway" 312 times this season* — and then being able to click the number and hear one.

Running jokes are the headline feature. Your group already knows its recurring bits by name, so you name them once as a watchlist of words and phrases, and every episode reports them. Counting is deterministic SQL, never a guess, so the numbers are worth arguing about.

That design has a useful side effect. Once per-episode aggregates are stored queryably, a question like *"how many times have we ever discussed guardachuvas?"* is one indexed aggregate across the whole series. The AI assistant that answers it in plain English is deliberately **the last thing built and the cheapest** — everything it needs gets built first, for the dashboard. See [`ADR 0007`](docs/adr/0007-assistant-is-tool-use-not-rag.md).

## Status

**It runs.** Live on Vercel behind a shared password, against Supabase and Groq, on free tiers with no payment method anywhere.

**What works today**

- Upload a full-length episode. The browser decodes it, splits it on the chunk plan and uploads each piece straight to object storage — a serverless function only accepts about 4.5 MB of body, so the audio never passes through the server.
- Transcription paced against the provider's allowance, which refills continuously rather than resetting hourly. A two-hour episode is ten chunks; against a full balance it finishes in minutes. Closing the tab no longer strands it.
- Word and term counts with Brazilian Portuguese lemmatisation — diacritics preserved, enclitics split, dictionary before stemmer, and a short hand-written override list for the words a general dictionary gets right about the language and wrong about how people talk.
- Running jokes: name a bit, list the spellings the transcriber actually produces, and get counts with a timestamp behind each one. Recounting past episodes is free, because the transcripts are kept.
- Full-text search over every transcript, returning the handful of *moments* a conversation happened in rather than a column of near-identical timestamps.
- A back catalogue can be walked in from the show's own RSS feed with one command, one episode at a time across days — paced to the transcription allowance rather than the connection, and safe to stop and re-run. See [`tools/backfill/`](tools/backfill/README.md).
- Bilingual throughout, Portuguese and English.

**What is not finished**

- **The analysis is still Portuguese-only.** The language of an episode is now chosen at upload ([`ADR 0022`](docs/adr/0022-the-language-is-chosen-per-episode.md)), but the stop words, fillers, stemmer and lemma dictionary are all pt-BR. An episode transcribed as English would be counted with Portuguese stop words, so its numbers are not yet trustworthy.
- **There is no speaker dimension**, and it is cut rather than deferred — only the final mixed file is uploaded ([`ADR 0015`](docs/adr/0015-no-speaker-attribution.md)). "Who said it" is not a question this can answer.
- **Search matches words, not meaning.** Finding a story about a dog requires someone to have said a word you can guess.
- The assistant that answers questions in plain English is still the last thing to build ([`ADR 0007`](docs/adr/0007-assistant-is-tool-use-not-rag.md)).

21 ADRs record why the code looks the way it does, including the decisions that were reversed. The docs below remain the plan of record for what has not been built.

## Documentation

**Start here:** [`docs/product/roadmap.md`](docs/product/roadmap.md) — the increments and what ships when.

**Product**
| | |
|---|---|
| [`personas.md`](docs/product/personas.md) | Who it's for |
| [`use-cases.md`](docs/product/use-cases.md) | What people do with it |
| [`user-journeys.md`](docs/product/user-journeys.md) | End-to-end flows |
| [`backlog.md`](docs/product/backlog.md) | Stories with Gherkin acceptance criteria — **the source of the test suite** |
| [`glossary-and-domain.md`](docs/product/glossary-and-domain.md) | The domain language, and what "a word was said" actually means |
| [`definition-of-ready-and-done.md`](docs/product/definition-of-ready-and-done.md) | Quality gates |
| [`metrics.md`](docs/product/metrics.md) | How we know it's working |
| [`risks.md`](docs/product/risks.md) | What could go wrong, and the cheapest way to find out |
| [`release-strategy.md`](docs/product/release-strategy.md) | How changes reach the app |
| [`open-questions.md`](docs/product/open-questions.md) | What's still undecided |

**Engineering**
| | |
|---|---|
| [`tech-stack.md`](docs/architecture/tech-stack.md) | What it's built with, and what was rejected |
| [`system-design.md`](docs/architecture/system-design.md) | Pipeline, data model, API surface, the analysis engine |
| [`testing-strategy.md`](docs/architecture/testing-strategy.md) | TDD in practice: Gherkin → tests, fakes, the credibility guards |
| [`docs/adr/`](docs/adr/) | Numbered decision records — including three reversals, kept on the record |
| [`tools/backfill/`](tools/backfill/README.md) | Getting a back catalogue in from the show's RSS feed: prerequisites, pacing, and how to resume |

## How this gets built

- **Test-driven.** The failing test comes first, and we watch it fail. The backlog's acceptance criteria *are* the test suite.
- **Evolutionary, never waterfall.** Every increment ships end to end. If stopping after it would leave a user with nothing, the slice is wrong.
- **Small commits.** One concern each, committed on green.
- **Counts come from SQL, never from a language model.** The model phrases; it does not do arithmetic.

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Credits

The Portuguese lemma dictionary is open data under ODbL, and the licence asks to be credited. [`ATTRIBUTION.md`](ATTRIBUTION.md) says who, what it does for us, and what we changed — and that notice has to be reachable from inside the app before anything is shared publicly.
