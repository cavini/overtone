# Overtone — Product Roadmap

**What this is.** Analytics for a podcast a small group records together. Upload an episode, get a transcript and counts for the bits the group actually cares about — the running jokes, the recurring topics — and see how those move **episode to episode**. The series is the product. One analysed episode is a party trick; twelve of them is a show you can argue about.

**Who it's for, in the stakeholder's words:** *"a fun free app that my friends can use without me having to keep my computer running all the time and having to pay for anything."* That sentence is the scope. Everything below is free to run, nothing runs on anybody's laptop, and no plan here contains money.

**North Star: Compared Episodes per Month (CEM)** — episodes that finished processing *and* whose series view someone opened within 7 days. Both halves of the promise in one number: the group keeps uploading, and keeps looking across episodes. See [`metrics.md`](./metrics.md).

**Access model (decided):** each friend signs in with a magic link and has their own library; any single result can be shared read-only by link. No teams, no roles, no sharing beyond that link.

## The stack is settled, and it dictates the sequence

Groq (`whisper-large-v3-turbo`), Vercel Hobby, Supabase (Postgres + storage + magic-link auth), `wink-nlp` in process. All free, no card. Five facts drive everything:

| Fact | Consequence |
|---|---|
| Episodes are routinely **1 h 40 m – 2 h** | Nothing in this plan may assume short audio. Every estimate, limit and test fixture uses a two-hour episode as the normal case. |
| Groq runs ~160× realtime — a 2-hour episode is ~45 s of transcription, split into ~5 chunks and run in parallel it lands in well under a minute, inside Vercel's 300 s limit | Transcription happens **inside the web request** (ADR 0010). No queue, no worker, no Docker, no job-state machine. The old "reliable async pipeline" increment does not exist. |
| **25 MB per request**, which is a *size* limit, not a duration one — 16 kHz mono Opus puts 2 hours in ~21 MB | The browser **chunks each episode into ~20–25 min pieces on silence boundaries**, compresses, and uploads them; the server transcribes chunks in parallel and **stitches the timestamps**. That stitching is the highest-risk code in the project: an off-by-one in a chunk offset silently points every later count at the wrong moment. |
| Free tier is **7,200 audio-seconds/hour and 28,800/day** | A 2-hour episode *is* 7,200 seconds, so it spends the entire hourly allowance: **one 2-hour episode per hour, four per day.** Fine for a weekly show, a hard wall for a back catalogue (R26). Parallel chunks cost nothing extra — duration is what's billed — and 5 requests is nowhere near 20/min. |
| Supabase pauses a project after 7 idle days | A daily keep-alive ping is a shipping requirement, not an optimisation. |

**No speaker diarisation exists in the free stack.** "Who talks most" is only possible from per-host tracks, and only as an **audio-energy** comparison: transcribe the mixed file once, then attribute each word to whichever host's track is loudest at that timestamp. Not scheduled — see *Later*.

Personas, use cases, journeys, domain language and Gherkin acceptance criteria are owned by the Product Owner — [`personas.md`](./personas.md), [`use-cases.md`](./use-cases.md), [`user-journeys.md`](./user-journeys.md), [`glossary-and-domain.md`](./glossary-and-domain.md), [`backlog.md`](./backlog.md), [`definition-of-ready-and-done.md`](./definition-of-ready-and-done.md). This document sequences them; it does not restate them.

---

## Increments

Estimates are in **weekends of spare time (~8 h each)** by one person building this for fun. They are estimates, not commitments; life will reorder them.

### M0 — Walking skeleton · 1 weekend (est.)

> Open the live Vercel URL → drop in a 3-minute clip → about ten seconds later, read a real transcript and a real count table.

| | |
|---|---|
| **Goal** | Prove upload → real Groq transcript → one real count → rendered, on a public URL. |
| **Crude on purpose** | One shared password in an env var, nothing persisted, one file per request, no chunking or compression, naive tokenising plus a stopword list, unstyled table, raw error strings. Chunking is M1's hard part and deserves its own weekends, not a corner of this one. |
| **Non-negotiable even so** | Real Groq transcription behind the `TranscriptionProvider` port with a fixture-backed fake; deployed to the real Vercel URL on push; CI green; test-first from the first commit. Deployment is *in* M0 — Vercel Hobby auto-deploys from git, so there is no reason to sit on localhost. |
| **Exit** | (1) A 3-min clip uploaded from a phone browser returns a table in <30 s. (2) Term counts for a committed fixture match a hand-counted expectation exactly, asserted in CI. (3) One e2e smoke drives the real upload path against the fake provider. (4) It is reachable at the production URL by someone who is not the engineer. |
| **Deferred** | Accounts, persistence, chunking, compression, watchlists, series view, sharing. |
| **Stop here?** | Thin but real: a word readout of a short clip nobody had before. Nobody would miss it. |

### M1 — Sign in, library, full-length episodes · 3 weekends (est.)

The increment that makes it *their* app rather than a demo, and the one that makes two-hour episodes work. The biggest and riskiest thing in the plan.

| | |
|---|---|
| **Goal** | Friends sign in and upload a real two-hour episode that comes back correct and stays in a library. |
| **User-visible** | Magic-link sign-in; drag in a whole episode; the browser splits it on silence into ~20–25 min chunks, compresses each to 16 kHz mono Opus, uploads them, and the server transcribes them in parallel and stitches one continuous transcript; a library list with title, date and duration; delete an episode. When the hourly allowance is spent, a plain message saying so and roughly when to retry. |
| **Checkpoints** (shippable states inside the increment, not separate increments — a one-chunk cap is of no use to a group whose episodes are all two hours) | **a)** auth + library + single-chunk episodes. **b)** chunking, compression and stitching. **c)** rate-limit handling, keep-alive, delete. |
| **Exit** | (1) A real 1 h 40 m – 2 h episode from the actual show completes end to end and the transcript reads continuously across every seam — no lost or duplicated sentences. (2) **Timestamp stitching is tested at every chunk boundary**: word timestamps land within ±1 s of hand-checked positions in a committed multi-chunk fixture, and a deliberately wrong chunk offset fails a test. (3) Chunk boundaries fall on silence, never mid-word. (4) Total wall clock for a 2-hour episode is under 300 s, measured in prod. (5) Two friends sign in by magic link and each sees only their own episodes; a cross-account read test fails closed. (6) Uploading a second 2-hour episode within the hour produces a readable "free hour is used up, try again in ~N minutes" message, never a stack trace. (7) Audio is deleted from storage once transcription succeeds (transcript is the durable artifact, ADR 0005), asserted by test. (8) A daily cron pings Supabase; the project survives an 8-day gap with no uploads. |
| **Deferred** | Watchlists, series view, sharing, speaker attribution, back-catalogue import. |
| **If stitching fights back** | Ship checkpoint (a) — real auth, real library, episodes up to one chunk — and give chunking a dedicated weekend. Do **not** let it quietly absorb a fourth and fifth weekend; re-forecast out loud instead. |
| **Stop here?** | Yes — the whole show, in one place, with per-episode word stats, usable from any device by the whole group. |

### M2 — Running jokes · 1 weekend (est.)

The headline feature. A podcast group already knows its bits by name.

| | |
|---|---|
| **Goal** | Count the things the group actually cares about, with a quote behind every number. |
| **User-visible** | Name a bit once ("Hotdog Corner" = hotdog, hot dog, hotdogs, dog of heat); every episode reports a count per bit; click a count → the timestamped quotes that produced it → click a quote → the transcript at that moment. A density strip showing *when* in the episode a bit clustered. |
| **Exit** | (1) Case, plural, hyphen and spacing variants collapse to one bit, by unit test per class. (2) Counts for a golden set of 2 real two-hour episodes × 10 named bits match hand counts: median error ≤5%. (3) Every count drills to quotes, and 100% of sampled quotes actually contain a matched form **at the right timestamp** — which is also the standing regression test for M1's stitching. (4) Matched surface forms are shown next to the count, so a gap is visible rather than silent. (5) Re-running analysis on a stored transcript is free, instant, and spends no audio-seconds (ADR 0005). (6) The group names at least five real bits without being prompted with examples. |
| **Deferred** | Automatic topic discovery, paraphrase/semantic matching, anything cross-episode. |
| **Stop here?** | Yes, and this is the first increment they'd be annoyed to lose. |

### M3 — The series view · 1 weekend (est.)

| | |
|---|---|
| **Goal** | Answer "across episodes" — the stakeholder's actual words — and make the series the home page. |
| **User-visible** | One row per episode, one column per bit, counts in the cells; a per-bit line across the season; "compare episode to episode" picking any two and showing what rose and fell; the series view becomes the landing page after sign-in. |
| **Exit** | (1) The series view reads stored per-episode aggregates, never re-scans transcripts; 30 episodes render in <1 s. (2) Adding or editing a bit backfills counts across the whole library by recomputing from stored transcripts, with no re-transcription and no audio-seconds spent — asserted by test. (3) A two-episode comparison names the biggest movers in both directions. (4) The group can point at one thing the series view told them that they did not already know. |
| **Deferred** | Who talks most, the assistant, back-catalogue import, per-bit alerts. |
| **Stop here?** | Yes — this is the product the stakeholder described. If the project froze here it would have delivered. |

### M4 — Share links and rough edges · 1 weekend (est., hard timebox)

| | |
|---|---|
| **Goal** | Make one result shareable and the app pleasant. Then stop. |
| **User-visible** | "Share this" on an episode or a bit → an unguessable read-only link that works without signing in; empty, loading and error states that read like sentences; works on a phone; one line saying episode audio is sent to Groq for transcription and roughly how accurate to expect it to be. |
| **Exit** | (1) A share link opens for a signed-out stranger and exposes exactly the shared result — no library, no other episodes, no account data; asserted by test. (2) Revoking a link makes it 404. (3) Every async state has a designed screen, including "this hour's free transcription is used up". (4) A friend who has never seen the app signs in and uploads an episode with no help. (5) One weekend. Unfinished polish is cut, not carried. |
| **Deferred** | Everything in *Later*. |
| **Stop here?** | Yes — this is v1, and v1 is the plan. |

---

## Later, only if the group asks

Not scheduled, not estimated, no implied order. Each needs a trigger before any work starts.

| Lane | Trigger, and what it actually involves |
|---|---|
| **Who talks most** (per-host tracks as an energy signal) | The group confirms they already record one track per host (Q13). Design: transcribe the **mixed** file once, then attribute each word to whichever host's track is loudest at that timestamp. Transcribing tracks separately is wrong twice — mics pick each other up, so counts double, and three 2-hour tracks is 6 audio-hours against a 2-hour hourly allowance (R24). |
| **Back-catalogue import** | The group asks for old episodes. There is no clever version: 50 episodes × 2 h is 100 audio-hours, about **two weeks of drip-feeding** at four a day (R26). The only thing worth building is an honest "12 of 50 imported, next at 14:30" screen. |
| **Ask the series** (chat over the aggregates, Groq's free LLM, behind the one `assistant` flag) | M3 has shipped, counts are trusted, and someone keeps asking a question the series view can't answer. Counting stays in SQL — the model only phrases answers (ADR 0007). |
| Automatic bit *suggestions*; a second language; scheduled digests; RSS ingest | Real demand, stated twice, by someone other than the builder. |

---

## Product decisions that constrain the stack

Beyond the five stack facts above:

| Product decision | Constraint | Satisfied by |
|---|---|---|
| Accounts from M1 | `user_id` on every row and every query from the first migration; cross-account isolation testable | Supabase magic-link auth + RLS |
| 7,200 audio-seconds/hour | Rate-limit state is a **user-visible product state**, not an error page; no feature may assume more than four episodes a day | M1 |
| Transcript is the durable artifact | Changing a bit definition recomputes counts for free and never re-transcribes; audio is deleted after success | ADR 0005 |
| Series view is the home page | Per-episode aggregates stored queryably from M2, every word addressable by timestamp | M2/M3 |
| Counts must be explainable | Deterministic matching over named bits with synonym sets; no clustering in the counting path | ADR 0006 |
| TDD throughout | Groq behind a port with a fixture-backed fake; **no test may call Groq** — the allowance is shared with real users | ADR 0004, `CLAUDE.md` |

---

## Sequence at a glance

```
                  W1  W2  W3  W4  W5  W6  W7
M0 Skeleton       ███
M1 Sign in + eps      ███ ███ ███
M2 Running jokes                  ███
M3 Series view                        ███
M4 Share + edges                          ███
```

| # | Increment | Weekends | Ships |
|---|---|---|---|
| M0 | Walking skeleton | 1 | live URL |
| M1 | Sign in, library, full-length episodes | 3 | yes |
| M2 | Running jokes | 1 | yes |
| M3 | The series view | 1 | yes |
| M4 | Share links and rough edges | 1 | **v1** |

**Total ≈7 weekends, roughly 55 hours — an estimate.** Calendar-wise, two to three months of spare time. M0–M1 are the committed part; re-forecast after M1, because chunking and stitching are the one place this plan could be wrong by a weekend or two.

If something has to be cut, cut M4's polish before M3's series view. A pretty single-episode page is not what was asked for.
