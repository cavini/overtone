# Overtone — Product Roadmap

**What this is.** Analytics for a podcast a small group records together **in Brazilian Portuguese**. Upload the finished episode, get a transcript and counts for the bits the group actually cares about — the running jokes, the recurring topics — and see how those move **episode to episode**. The series is the product. One analysed episode is a party trick; twelve of them is a show you can argue about.

**Who it's for, in the stakeholder's words:** *"a fun free app that my friends can use without me having to keep my computer running all the time and having to pay for anything."* That sentence is the scope. Everything below is free to run, nothing runs on anybody's laptop, and no plan here contains money.

**North Star: Compared Episodes per Month (CEM)** — episodes that finished processing *and* whose series view someone opened within 7 days. Both halves of the promise in one number: the group keeps uploading, and keeps looking across episodes. See [`metrics.md`](./metrics.md).

**Access model (decided):** each friend signs in with a magic link and has their own library; any single result can be shared read-only by link, and that link shows **counts and the quotes behind them, not the full transcript** (Q17, decided). No teams, no roles, no sharing beyond that link.

## The stack is settled, and it dictates the sequence

Groq (`whisper-large-v3-turbo`), Vercel Hobby, Supabase (Postgres + storage + magic-link auth), and a **pt-BR text pipeline** in process (ADR 0014) — a bundled lemma dictionary with a Portuguese stemmer fallback and a pt-BR stop-word list. All free, no card. Seven facts drive everything:

| Fact | Consequence |
|---|---|
| The show is recorded in **Brazilian Portuguese** | `language=pt` is pinned on every transcription call. `wink-nlp` is out: its lemmatiser and stop-word list are English-only and neither exists for Portuguese. Building the pt-BR pipeline is **real work, not a config change** — it is budgeted below. pt-BR word error rates are higher than English, worst on proper nouns, slang and coinages (R1), which are exactly what this product counts. |
| The uploaded file is the **final edited mix** — one file, no per-host tracks | *"They would only upload the final edited file."* Speaker attribution is **cut from the product**, not deferred (ADR 0015, R24 retired). Counts therefore describe the **published episode**, not the raw conversation: anything cut in the edit was never said as far as Overtone is concerned, and filler-word or pace stats measure the edit. Say that in-product rather than implying otherwise. Chunking is unaffected. |
| Episodes are routinely **1 h 40 m – 2 h** | Nothing in this plan may assume short audio. Every estimate, limit and test fixture uses a two-hour episode as the normal case. |
| Groq runs ~160× realtime — a 2-hour episode is ~45 s of transcription, split into ~5 chunks and run in parallel it lands in well under a minute, inside Vercel's 300 s limit | Transcription happens **inside the web request** (ADR 0010). No queue, no worker, no Docker, no job-state machine. The old "reliable async pipeline" increment does not exist. |
| **25 MB per request**, which is a *size* limit, not a duration one — 16 kHz mono Opus puts 2 hours in ~21 MB | The browser **chunks each episode into ~20–25 min pieces on silence boundaries**, compresses, and uploads them; the server transcribes chunks in parallel and **stitches the timestamps**. That stitching is the highest-risk code in the project: an off-by-one in a chunk offset silently points every later count at the wrong moment. |
| Free tier is **7,200 audio-seconds/hour and 28,800/day** | A 2-hour episode *is* 7,200 seconds, so it spends the entire hourly allowance: **one 2-hour episode per hour, four per day.** Fine for a weekly show, a hard wall for a back catalogue (R26). Parallel chunks cost nothing extra — duration is what's billed — and 5 requests is nowhere near 20/min. |
| Supabase pauses a project after 7 idle days | A daily keep-alive ping is a shipping requirement, not an optimisation. |

**"Who talks most" is out of the product.** It needed per-host tracks; there are none, and the free stack has no diarisation. There is no *Later* lane for it and no estimate — the question is closed, not parked (ADR 0015, superseding ADR 0011's energy-attribution decision). A mixed-only file gets no speaker breakdown and the UI says why.

Personas, use cases, journeys, domain language and Gherkin acceptance criteria are owned by the Product Owner — [`personas.md`](./personas.md), [`use-cases.md`](./use-cases.md), [`user-journeys.md`](./user-journeys.md), [`glossary-and-domain.md`](./glossary-and-domain.md), [`backlog.md`](./backlog.md), [`definition-of-ready-and-done.md`](./definition-of-ready-and-done.md). This document sequences them; it does not restate them.

---

## Increments

Estimates are in **weekends of spare time (~8 h each)** by one person building this for fun. They are estimates, not commitments; life will reorder them.

**Re-estimated for pt-BR and for the speaker cut.** The pt-BR pipeline is split where the work actually falls: M0 takes the cheap half (a pt-BR stop-word list and a **diacritic-preserving** fold — an afternoon, so M0 stays at one weekend), M2 takes the expensive half (lemma dictionary, stemmer fallback, over-merge guard, orthographic aliases) and goes **1 → 2 weekends**. Cutting speaker attribution removes no scheduled weekends — it was never in the seven, only in *Later* — but it does shrink M1's upload surface to one file with no track-set concept, which buys headroom against the stitching risk rather than a whole weekend back. **Net: 7 → 8 weekends.**

### Before M0 — the pt-BR recall pilot · one evening, free, no code

Not an increment; a gate. Ten minutes of one real episode through the actual Groq service with `language=pt`; hand-check a written list of in-joke terms and proper nouns; record **recall** (R1). Portuguese ASR is worse than English exactly where the in-jokes live, and the in-jokes are the product — so this is the one cheap thing that can tell us Overtone does not work for this audio. **Read the result before planning anything below.** Recall under 85% and the product gets rethought, not the UI. Three other pt-BR risks (R27, R28, R13) ride along on the same ten minutes.

### M0 — Walking skeleton · 1 weekend (est.)

> Open the live Vercel URL → drop in a 3-minute clip → about ten seconds later, read a real transcript and a real count table.

| | |
|---|---|
| **Goal** | Prove upload → real Groq transcript → one real count → rendered, on a public URL. |
| **Crude on purpose** | One shared password in an env var, nothing persisted, one file per request, no chunking or compression, naive tokenising plus a **pt-BR** stop-word list, unstyled table, raw error strings. No lemmatisation yet. Chunking is M1's hard part and deserves its own weekends, not a corner of this one. |
| **Non-negotiable even so** | Real Groq transcription with `language=pt`, behind the `TranscriptionProvider` port with a fixture-backed fake; **normalisation preserves diacritics** (R29) — casefold only, never accent-strip; deployed to the real Vercel URL on push; CI green; test-first from the first commit. Deployment is *in* M0 — Vercel Hobby auto-deploys from git, so there is no reason to sit on localhost. |
| **Exit** | (1) A 3-min clip of the real show uploaded from a phone browser returns a table in <30 s. (2) Term counts for a committed **pt-BR** fixture match a hand-counted expectation exactly, asserted in CI. (3) A diacritics test pins `e`/`é` and `por`/`pôr` as **distinct** tokens and fails if normalisation strips accents. (4) One e2e smoke drives the real upload path against the fake provider. (5) It is reachable at the production URL by someone who is not the engineer. |
| **Deferred** | Accounts, persistence, chunking, compression, lemmatisation, watchlists, series view, sharing. |
| **Stop here?** | Thin but real: a word readout of a short clip nobody had before. Nobody would miss it. |

### M1 — Sign in, library, full-length episodes · 3 weekends (est.)

The increment that makes it *their* app rather than a demo, and the one that makes two-hour episodes work. The biggest and riskiest thing in the plan.

| | |
|---|---|
| **Goal** | Friends sign in and upload a real two-hour episode that comes back correct and stays in a library. |
| **User-visible** | Magic-link sign-in; drag in **one file — the final edited episode**; the browser splits it on silence into ~20–25 min chunks, compresses each to 16 kHz mono Opus, uploads them, and the server transcribes them in parallel and stitches one continuous transcript; a library list with title, date and duration; delete an episode. When the hourly allowance is spent, a plain message saying so and roughly when to retry. |
| **Checkpoints** (shippable states inside the increment, not separate increments — a one-chunk cap is of no use to a group whose episodes are all two hours) | **a)** auth + library + single-chunk episodes. **b)** chunking, compression and stitching. **c)** rate-limit handling, keep-alive, delete. |
| **Exit** | (1) A real 1 h 40 m – 2 h episode from the actual show completes end to end and the transcript reads continuously across every seam — no lost or duplicated sentences. (2) **Timestamp stitching is tested at every chunk boundary**: word timestamps land within ±1 s of hand-checked positions in a committed multi-chunk fixture, and a deliberately wrong chunk offset fails a test. (3) Chunk boundaries fall on silence, never mid-word. (4) Total wall clock for a 2-hour episode is under 300 s, measured in prod. (5) Two friends sign in by magic link and each sees only their own episodes; a cross-account read test fails closed. (6) Uploading a second 2-hour episode within the hour produces a readable "free hour is used up, try again in ~N minutes" message, never a stack trace. (7) Audio is deleted from storage once transcription succeeds (transcript is the durable artifact, ADR 0005), asserted by test. (8) A daily cron pings Supabase; the project survives an 8-day gap with no uploads. |
| **Deferred** | Watchlists, series view, sharing, the pt-BR lemma pipeline, back-catalogue import. (Speaker attribution is not deferred — it is cut.) |
| **If stitching fights back** | Ship checkpoint (a) — real auth, real library, episodes up to one chunk — and give chunking a dedicated weekend. Do **not** let it quietly absorb a fourth and fifth weekend; re-forecast out loud instead. |
| **Stop here?** | Yes — the whole show, in one place, with per-episode word stats, usable from any device by the whole group. |

### M2 — Running jokes, on a pt-BR pipeline · 2 weekends (est., was 1)

The headline feature, and now the increment that carries the Portuguese text pipeline. A podcast group already knows its bits by name.

| | |
|---|---|
| **Goal** | Count the things the group actually cares about, in Brazilian Portuguese, with a quote behind every number. |
| **User-visible** | Name a bit once ("Hotdog Corner" = hotdog, hot dog, hotdogs, cachorro-quente); every episode reports a count per bit; click a count → the timestamped quotes that produced it → click a quote → the transcript at that moment. A density strip showing *when* in the episode a bit clustered. The matched surface forms sit next to every count, and adding a missed one is one click. |
| **New work (pt-BR)** | A bundled lemma dictionary with a Portuguese stemmer **fallback**, and a pt-BR stop-word list. The fallback is where the danger is: a dictionary covers common words, so the words that reach the stemmer are the out-of-vocabulary ones — which is exactly what a coinage or a nickname is. This is the weekend that was added. |
| **Checkpoints** | **a)** dictionary + stop-words + bit matching with aliases, shipped. **b)** stemmer fallback behind the over-merge guard. |
| **Exit** | (1) Case, plural, hyphen and spacing variants collapse to one bit, by unit test per class — **with diacritics preserved throughout** (R29). (2) **Over-merge guard** (R28): `casa`/`casar` stay distinct, `comer` never collapses onto `com`, asserted by a committed table of pt-BR near-miss pairs; any merge the stemmer proposes and the dictionary disagrees with is not taken. (3) **Orthographic aliases** (R27): `pra`/`para`, `tá`/`está`, `né`/`não é` count as one term by default, asserted by test, so a count cannot move because Whisper chose the written-standard spelling. (4) Counts for a golden set of 2 real two-hour episodes × 10 named bits match hand counts: median error ≤5%. (5) Every count drills to quotes, and 100% of sampled quotes actually contain a matched form **at the right timestamp** — the standing regression on M1's stitching. (6) Re-running analysis on a stored transcript is free, instant, and spends no audio-seconds (ADR 0005). (7) The group names at least five real bits without being prompted with examples. |
| **Deferred** | Automatic topic discovery, paraphrase/semantic matching, anything cross-episode. |
| **Stop here?** | Yes, and this is the first increment they'd be annoyed to lose. |

### M3 — The series view · 1 weekend (est.)

| | |
|---|---|
| **Goal** | Answer "across episodes" — the stakeholder's actual words — and make the series the home page. |
| **User-visible** | One row per episode, one column per bit, counts in the cells; a per-bit line across the season; "compare episode to episode" picking any two and showing what rose and fell; the series view becomes the landing page after sign-in. |
| **Exit** | (1) The series view reads stored per-episode aggregates, never re-scans transcripts; 30 episodes render in <1 s. (2) Adding or editing a bit backfills counts across the whole library by recomputing from stored transcripts, with no re-transcription and no audio-seconds spent — asserted by test. (3) A two-episode comparison names the biggest movers in both directions. (4) The group can point at one thing the series view told them that they did not already know. |
| **Deferred** | The assistant, back-catalogue import, per-bit alerts. |
| **Stop here?** | Yes — this is the product the stakeholder described. If the project froze here it would have delivered. |

### M4 — Share links and rough edges · 1 weekend (est., hard timebox)

| | |
|---|---|
| **Goal** | Make one result shareable and the app pleasant. Then stop. |
| **User-visible** | "Share this" on an episode or a bit → an unguessable read-only link that works without signing in, showing **counts and the quotes behind them, never the full transcript** (Q17, decided); empty, loading and error states that read like sentences; works on a phone; one line saying episode audio is sent to Groq for transcription in Portuguese, roughly how accurate to expect that to be, and that counts describe the **edited** episode. |
| **Exit** | (1) A share link opens for a signed-out stranger and exposes exactly the shared result — counts and matched quotes only; no full transcript, no library, no other episodes, no account data; asserted by test. (2) Revoking a link makes it 404. (3) Every async state has a designed screen, including "this hour's free transcription is used up". (4) A friend who has never seen the app signs in and uploads an episode with no help. (5) One weekend. Unfinished polish is cut, not carried. |
| **Deferred** | Everything in *Later*. |
| **Stop here?** | Yes — this is v1, and v1 is the plan. |

---

## Later, only if the group asks

Not scheduled, not estimated, no implied order. Each needs a trigger before any work starts.

| Lane | Trigger, and what it actually involves |
|---|---|
| **Back-catalogue import** | The group asks for old episodes. There is no clever version: 50 episodes × 2 h is 100 audio-hours, about **two weeks of drip-feeding** at four a day, and the audio alone would blow past the 1 GB storage tier (R26, Q16). The only thing worth building is an honest "12 of 50 imported, next at 14:30" screen. |
| **Ask the series** (chat over the aggregates, Groq's free LLM, behind the one `assistant` flag) | M3 has shipped, counts are trusted, and someone keeps asking a question the series view can't answer. Counting stays in SQL — the model only phrases answers (ADR 0007). |
| Automatic bit *suggestions*; scheduled digests; RSS ingest | Real demand, stated twice, by someone other than the builder. |

**Not lanes — out of scope.** Two things are closed rather than parked, and neither has a trigger:

| Out of scope | Why it is closed, not deferred |
|---|---|
| **Who talks most / speaker attribution** | There are no per-host tracks — the upload is the final edited mix — and the free stack has no diarisation. Nothing to gate on, so it is removed from the product (R24 retired). |
| **A second language** | The show is in Brazilian Portuguese and the pipeline is built for it. Multi-language would be **a different product decision**, not the next item on this list: a second lemma dictionary, a second stop-word list, a second golden set and a language choice in the UI. If it ever comes back it starts from that conversation. |

---

## Product decisions that constrain the stack

Beyond the seven stack facts above:

| Product decision | Constraint | Satisfied by |
|---|---|---|
| Accounts from M1 | `user_id` on every row and every query from the first migration; cross-account isolation testable | Supabase magic-link auth + RLS |
| 7,200 audio-seconds/hour | Rate-limit state is a **user-visible product state**, not an error page; no feature may assume more than four episodes a day | M1 |
| Transcript is the durable artifact | Changing a bit definition recomputes counts for free and never re-transcribes; audio is deleted after success | ADR 0005 |
| Series view is the home page | Per-episode aggregates stored queryably from M2, every word addressable by timestamp | M2/M3 |
| Counts must be explainable | Deterministic matching over named bits with synonym sets; no clustering in the counting path | ADR 0006 |
| Brazilian Portuguese, not English | `language=pt` pinned; pt-BR lemma dictionary + stop-word list; diacritics preserved; no stemmer merge the dictionary disagrees with; orthographic aliases (`pra`/`para`) tested | M0 (cheap half) · M2 (the rest) |
| The upload is the final edited mix | One file per episode, no track-set concept, no speaker breakdown; counts and filler/pace stats are described in-product as measuring the **published** episode | M1 · M4 copy |
| TDD throughout | Groq behind a port with a fixture-backed fake; **no test may call Groq** — the allowance is shared with real users | ADR 0004, `CLAUDE.md` |

---

## Sequence at a glance

```
                  W1  W2  W3  W4  W5  W6  W7  W8
pt-BR pilot      (one evening, before W1 — gates all of it)
M0 Skeleton       ███
M1 Sign in + eps      ███ ███ ███
M2 Jokes + pt-BR                  ███ ███
M3 Series view                            ███
M4 Share + edges                              ███
```

| # | Increment | Weekends | Was | Ships |
|---|---|---|---|---|
| M0 | Walking skeleton (pt-BR stop-words, diacritics) | 1 | 1 | live URL |
| M1 | Sign in, library, full-length episodes | 3 | 3 | yes |
| M2 | Running jokes, on a pt-BR pipeline | **2** | 1 | yes |
| M3 | The series view | 1 | 1 | yes |
| M4 | Share links and rough edges | 1 | 1 | **v1** |

**Total ≈8 weekends, roughly 64 hours — an estimate, up from 7.** The pt-BR pipeline added a weekend at M2; cutting speaker attribution gave none back, because it was never scheduled. Calendar-wise, two to three months of spare time. M0–M1 are the committed part; re-forecast after M1, because chunking and stitching are the one place this plan could be wrong by a weekend or two — and after the pt-BR recall check, which could be wrong about the whole thing.

If something has to be cut, cut M4's polish before M3's series view. A pretty single-episode page is not what was asked for.
