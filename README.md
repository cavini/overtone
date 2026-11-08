# Overtone

Podcast analytics.

Upload each episode. Overtone transcribes it and tells you how often the running jokes actually came up, which words you can't stop saying, and how all of it is changing **across the series** — with a timestamped quote behind every single number.

> *Overtone* — in acoustics, the harmonics stacked above a fundamental: the part of a sound you don't consciously hear. In speech, the themes running underneath what was actually said. Both are the product.

## See it work

https://github.com/user-attachments/assets/772ab0b5-dbdf-45b7-8b06-f5bf01a32c59

<sub><a href="https://overtone-five.vercel.app">Try it live</a> — sign-in is invitation-only, because uploading spends a transcription allowance shared by everyone with an account.</sub>

---

## It costs nothing to run

Three services, all free tiers, **no credit card anywhere**:

| | Service | Free tier |
|---|---|---|
| Transcription | **Groq** · `whisper-large-v3` | 8 hrs audio/day · word-level timestamps · 7,200 audio-sec/hour |
| Hosting | **Vercel Hobby** | Free forever · a real URL · 5-min functions |
| Database, files, logins | **Supabase** | 500 MB Postgres · 1 GB files · magic-link auth |

Nothing runs on your machine. Your friends sign in with an email link and use it from anywhere.

The reason this works: a ten-minute chunk comes back from Groq in a couple of seconds — fast enough to transcribe **inside a normal web request**, so there is no background worker, no job queue, no Docker and nothing to keep alive. See [`ADR 0010`](docs/adr/0010-free-hosted-stack-no-worker.md).

What paces a full episode is not the model but the allowance, and it is spent in **seconds of audio** rather than requests: 7,200 an hour, refilling at two per wall-second. So a two-hour episode arrives over five to ten minutes instead of all at once, and the app says where it is while it waits. The ceiling that actually binds is the 500 MB database — about 2 MB an episode — not the audio. See [`ADR 0020`](docs/adr/0020-chunking-is-mandatory-for-the-rate-limit.md).

## The idea

Transcription is a commodity and summarisation is crowded. What a podcast actually wants is **trustworthy counting**: *we've said "anyway" 312 times this season* — and then being able to click the number and hear one.

Running jokes are the headline feature. Your group already knows its recurring bits by name, so you name them once as a watchlist of words and phrases, and every episode reports them. Counting is deterministic SQL, never a guess, so the numbers are worth arguing about.

That design has a useful side effect. Once per-episode aggregates are stored queryably, a question like *"how many times have we ever discussed guardachuvas?"* is one indexed aggregate across the whole series. The AI assistant that answers it in plain English is deliberately **the last thing built and the cheapest** — everything it needs gets built first, for the dashboard. See [`ADR 0007`](docs/adr/0007-assistant-is-tool-use-not-rag.md).

## Status

**It runs**, at [overtone-five.vercel.app](https://overtone-five.vercel.app) — on Vercel, against Supabase and Groq, on free tiers with no payment method anywhere. Sign-in is invitation-only: uploading spends an allowance shared by everyone with an account, so the door is the budget.

**What works today**

- Upload a full-length episode. The browser decodes it, splits it on the chunk plan and uploads each piece straight to object storage — a serverless function only accepts about 4.5 MB of body, so the audio never passes through the server.
- Transcription paced against the provider's allowance, which refills continuously rather than resetting hourly. A two-hour episode is ten chunks; against a full balance it finishes in minutes. Closing the tab no longer strands it.
- Word and term counts with Brazilian Portuguese lemmatisation — diacritics preserved, enclitics split, dictionary before stemmer, and a short hand-written override list for the words a general dictionary gets right about the language and wrong about how people talk.
- Running jokes: name a bit, list the spellings the transcriber actually produces, and get counts with a timestamp behind each one. Recounting past episodes is free, because the transcripts are kept.
- Full-text search over every transcript, returning the handful of *moments* a conversation happened in rather than a column of near-identical timestamps.
- A back catalogue can be walked in from the show's own RSS feed with one command, one episode at a time across days — paced to the transcription allowance rather than the connection, and safe to stop and re-run. See [`tools/backfill/`](tools/backfill/README.md).
- **The language of each episode is heard, not declared.** Three half-minute windows are sampled from the middle of the recording, transcribed with no language stated, and the majority decides — then every chunk is transcribed as that, and the answer is stored on the episode so no existing count can move. It samples the *middle* on purpose: the show opens on music with English lyrics, so anything listening to the opening would answer "English" for every episode the group has ever recorded. 90 audio-seconds of a 7,200-second hour. See [`ADR 0036`](docs/adr/0036-the-language-is-heard-not-declared.md).
- **Audio in a language there is no analysis for is refused by name**, rather than counted as Portuguese. A Spanish recording analysed against Portuguese stop words produces a full set of plausible numbers and no hint that anything went wrong, which is worse than a refusal.
- **An English analysis pack**, not an English flag: its own stop words, fillers, contraction splitting, plural-only stemmer and half of the lemma dictionary, keyed by language. Offering a third language without writing its pack is a compile error rather than a silently Portuguese result. See [`ADR 0023`](docs/adr/0023-an-english-language-pack.md).
- Search reads both language configurations for every reader, which turned out to **improve Portuguese recall** rather than merely add English: Portuguese stemming leaves short plurals alone, so a search for `ano` was missing 133 segments that say `anos`.
- Bilingual interface throughout, Portuguese and English — and switching it cannot move a single number, which has a test.

**What is not finished**

- **A genuinely bilingual episode has no right answer.** One pack is chosen for the whole recording, so a conversation that switches language mid-episode gets the other half counted under the wrong stop words. The probes detect the split and the pipeline cannot act on it.
- **The intro is still counted.** Detection steps around the opening music; the analysis does not, so its English lyrics are in every episode's word counts. Fixing it changes analysis output, which means re-analysing the archive.
- **There is no speaker dimension**, and it is cut rather than deferred — only the final mixed file is uploaded ([`ADR 0015`](docs/adr/0015-no-speaker-attribution.md)). "Who said it" is not a question this can answer.
- **Search matches words, not meaning.** Finding a story about a dog requires someone to have said a word you can guess.
- The assistant that answers questions in plain English is still the last thing to build ([`ADR 0007`](docs/adr/0007-assistant-is-tool-use-not-rag.md)).

36 ADRs record why the code looks the way it does, including the decisions that were reversed. The docs below remain the plan of record for what has not been built.

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
