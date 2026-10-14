# Overtone — Product Roadmap

**What this is.** Analytics for a podcast a small group records together **in Brazilian Portuguese**. Upload the finished episode, get a transcript and counts for the bits the group actually cares about — the running jokes, the recurring topics — and see how those move **episode to episode**. The series is the product. One analysed episode is a party trick; twelve of them is a show you can argue about. **Only new episodes go in** (Q16, resolved), so twelve of them is twelve weeks away — the product arrives before the thing that makes it worth having. The interface is **pt-BR and English, switchable**; the audio is always pt-BR.

**Who it's for, in the stakeholder's words:** *"a fun free app that my friends can use without me having to keep my computer running all the time and having to pay for anything."* That sentence is the scope. Everything below is free to run, nothing runs on anybody's laptop, and no plan here contains money.

**North Star: Compared Episodes per Month (CEM)** — episodes that finished processing *and* whose series view someone opened within 7 days. Both halves of the promise in one number: the group keeps uploading, and keeps looking across episodes. See [`metrics.md`](./metrics.md).

**Access model (as it stands):** one shared password for the group, with magic-link sign-in built and dormant behind it (ADR 0028). **Sharing was built and then removed** at the group's request — there is no public link any more (US-039, ADR 0030). No teams, no roles, no sharing.

## The stack is settled, and it dictates the sequence

Groq (`whisper-large-v3-turbo`), Vercel Hobby, Supabase (Postgres + storage + magic-link auth), and a **pt-BR text pipeline** in process (ADR 0014) — a bundled lemma dictionary with a Portuguese stemmer fallback and a pt-BR stop-word list. All free, no card. Seven facts drive everything:

| Fact | Consequence |
|---|---|
| The show is recorded in **Brazilian Portuguese** | `language=pt` is pinned on every transcription call. `wink-nlp` is out: its lemmatiser and stop-word list are English-only and neither exists for Portuguese. Building the pt-BR pipeline is **real work, not a config change** — it is budgeted below. pt-BR word error rates are higher than English, worst on proper nouns, slang and coinages (R1), which are exactly what this product counts. |
| The uploaded file is the **final edited mix** — one file, no per-host tracks | *"They would only upload the final edited file."* Speaker attribution is **cut from the product**, not deferred (ADR 0015, R24 retired). Counts therefore describe the **published episode**, not the raw conversation: anything cut in the edit was never said as far as Overtone is concerned, and filler-word or pace stats measure the edit. Say that in-product rather than implying otherwise. Chunking is unaffected. |
| Episodes are routinely **1 h 40 m – 2 h** | Nothing in this plan may assume short audio. Every estimate, limit and test fixture uses a two-hour episode as the normal case. |
| Groq runs ~160× realtime — a 2-hour episode is ~45 s of transcription, split into ~5 chunks and run in parallel it lands in well under a minute, inside Vercel's 300 s limit | Transcription happens **inside the web request** (ADR 0010). No queue, no worker, no Docker, no job-state machine. The old "reliable async pipeline" increment does not exist. |
| **25 MB per request**, which is a *size* limit, not a duration one — 16 kHz mono Opus puts 2 hours in ~21 MB | The browser **chunks each episode into ~20–25 min pieces on silence boundaries**, compresses, and uploads them; the server transcribes chunks in parallel and **stitches the timestamps**. That stitching is the highest-risk code in the project: an off-by-one in a chunk offset silently points every later count at the wrong moment. |
| Free tier is **7,200 audio-seconds/hour and 28,800/day** | A 2-hour episode *is* 7,200 seconds, so it spends the entire hourly allowance: **one 2-hour episode per hour, four per day.** Fine for a weekly show, which is now the only case there is: Q16 is resolved — **only new episodes** — so the back-catalogue wall is moot rather than looming (R26 retired). Parallel chunks cost nothing extra — duration is what's billed — and 5 requests is nowhere near 20/min. |
| Supabase pauses a project after 7 idle days | A daily keep-alive ping is a shipping requirement, not an optimisation. |

**"Who talks most" is out of the product.** It needed per-host tracks; there are none, and the free stack has no diarisation. There is no *Later* lane for it and no estimate — the question is closed, not parked (ADR 0015, superseding ADR 0011's energy-attribution decision). A mixed-only file gets no speaker breakdown and the UI says why.

## The interface is bilingual — pt-BR and English, switchable

New scope, and it is **scheduled rather than absorbed silently**. **`next-intl`** carries it — locale routing, Server Component support, two catalogues — and **ADR 0017** adds the rule that makes it architectural rather than cosmetic: *no user-facing text exists below the presenter.* The architecture pass owns the mechanism; this document owns when it lands. The cost is not the library, it is discipline:

| Consequence | What it means in practice | Where |
|---|---|---|
| Every user-facing string lives in a **message catalogue** | Two catalogues, forever, every key in both. A sentence written straight into a component is a defect caught by a CI lint rule, not a tidy-up for later | **M0**, then every increment |
| Errors, warnings and empty states become **typed codes with parameters**, not sentences | `ALLOWANCE_EXHAUSTED{retryAfterHours}`, never `"this hour's free transcription is used up"`. The PO is rewriting the acceptance criteria to match | M0 → M4 |
| Numbers are formatted **per locale** | pt-BR writes `1.234,56`, English writes `1,234.56`. Counts are this product's entire output, so a separator in the wrong place is a **wrong number**, not a cosmetic defect (R30) | One helper in M0, asserted forever |

**The mechanism goes in M0.** Not because M0 has much copy — it has almost none — but because M0 is where the first user-facing strings get written, and the entire saving is that *no string is ever written outside a catalogue*. Retrofitting means hunting hard-coded strings through an app that already has hundreds. Wiring it on weekend one costs **one weekend and never comes back**; M0 goes 1 → 2 for it.

**The UI language and the audio language are different things.** The audio is always pt-BR and the analysis pipeline is always pt-BR (ADR 0014). Switching the interface to English must not move a single count: the pipeline takes a pinned `pt-BR` constant, never the request locale, and a test asserts byte-identical counts with the UI set to English (R31).

Personas, use cases, journeys, domain language and Gherkin acceptance criteria are owned by the Product Owner — [`personas.md`](./personas.md), [`use-cases.md`](./use-cases.md), [`user-journeys.md`](./user-journeys.md), [`glossary-and-domain.md`](./glossary-and-domain.md), [`backlog.md`](./backlog.md), [`definition-of-ready-and-done.md`](./definition-of-ready-and-done.md). This document sequences them; it does not restate them.

---

## Increments

Estimates are in **weekends of spare time (~8 h each)** by one person building this for fun. They are estimates, not commitments; life will reorder them.

**Re-estimated, round two: the bilingual UI in, the back catalogue out.** Round one split the pt-BR pipeline where the work falls — M0 took the cheap half (stop-word list, **diacritic-preserving** fold), M2 took the expensive half (lemma dictionary, stemmer fallback, over-merge guard, orthographic aliases) and went 1 → 2.

| Change | Effect | Why |
|---|---|---|
| Bilingual UI (`next-intl`) | **M0 1 → 2**, **M4 1 → 2** | M0 buys the mechanism: next-intl wired, locale routing, a switcher, both catalogues existing, the number-format helper and its tests. M4 is the copy increment, and every sentence in it now exists twice and gets checked on a phone in both locales. M1–M3 absorb their share — typed codes instead of sentences, counts through the formatter — without a scheduled weekend |
| Back-catalogue import **deleted** (Q16 resolved) | **0 weekends back** | It was never scheduled — a *Later* lane with no estimate. Deleting it removes a lane, an experiment and a blocking question, retires **R26** and downgrades **R23** from 4 to 2. It also *adds* **R32**: the "series view is thin until several episodes exist" half of R26 did not go away, it got worse |
| Speaker attribution cut (round one) | 0 weekends back | Also never scheduled. It shrank M1's upload surface to one file, which bought headroom against the stitching risk rather than a weekend |

**Net: 8 → 10 weekends.** Said plainly: the only honest scope *reduction* available — dropping the back catalogue — is not on the critical path, so it cannot pay for the i18n addition. The schedule grows by two weekends; the risk register grows by three live rows (R30, R31, R32) and loses one (R26).

**And one consequence of new-episodes-only, said plainly: the series starts empty and grows one episode at a time.** The cross-episode comparison this whole product is built around **does not exist until episode 2, and is not worth arguing about until episode 3 or 4** — a month of a weekly show after M3 ships. That changes what *"stop here and a user still gets value"* means early on: until several episodes exist, **all the value is per-episode, which is M2's and not M3's.** M2 is therefore the increment that has to stand alone, M3 ships into a library that will look thin for weeks, and the North Star reads near zero for the first month **by design** (R32, [`metrics.md`](./metrics.md)).

### Before M0 — the pt-BR recall pilot · one evening, free, no code

Not an increment; a gate. Ten minutes of one real episode through the actual Groq service with `language=pt`; hand-check a written list of in-joke terms and proper nouns; record **recall** (R1). Portuguese ASR is worse than English exactly where the in-jokes live, and the in-jokes are the product — so this is the one cheap thing that can tell us Overtone does not work for this audio. **Read the result before planning anything below.** Recall under 85% and the product gets rethought, not the UI. Three other pt-BR risks (R27, R28, R13) ride along on the same ten minutes.

### M0 — Walking skeleton, bilingual from the first string · 2 weekends (est., was 1)

> **Status: the exit criteria are met locally, except (5) — it is not deployed yet.** A real 15-minute slice of the show, uploaded through the browser, comes back in about 25 seconds with 2 687 words, 432 distinct terms and a count table, in either language. Several things M0 called *crude on purpose* were not built crudely, because the engine was finished first: lemmatisation, chunking, compression and persistence are all real. What is still missing is the public URL and accounts.

> Open the live Vercel URL → drop in a 3-minute clip → about ten seconds later, read a real transcript and a real count table — then flip the interface to English and read the same numbers.

| | |
|---|---|
| **Goal** | Prove upload → real Groq transcript → one real count → rendered, on a public URL, with **every user-facing string already in a catalogue in two languages**. |
| **Crude on purpose** | One shared password in an env var, nothing persisted, one file per request, no chunking or compression, naive tokenising plus a **pt-BR** stop-word list, unstyled table. No lemmatisation yet. Chunking is M1's hard part and deserves its own weekends, not a corner of this one. |
| **Crude is not an excuse for hard-coded copy** | Errors may render bluntly — `TRANSCRIPTION_FAILED{chunkIndex}` as plain text in a grey box is fine — but they are **typed codes with parameters resolved through a catalogue**, never sentences in a component. This is the one M0 corner that cannot be cut, because it is the corner that gets expensive later. |
| **Non-negotiable even so** | Real Groq transcription with `language=pt`, behind the `TranscriptionProvider` port with a fixture-backed fake; **normalisation preserves diacritics** (R29) — casefold only, never accent-strip; `next-intl` wired with locale routing, a visible locale switcher, and **both catalogues existing**; counts rendered through **one locale-aware number formatter** (R30); deployed to the real Vercel URL on push; CI green; test-first from the first commit. Deployment is *in* M0 — Vercel Hobby auto-deploys from git, so there is no reason to sit on localhost. |
| **Exit** | (1) A 3-min clip of the real show uploaded from a phone browser returns a table in <30 s. (2) Term counts for a committed **pt-BR** fixture match a hand-counted expectation exactly, asserted in CI. (3) A diacritics test pins `e`/`é` and `por`/`pôr` as **distinct** tokens and fails if normalisation strips accents. (4) One e2e smoke drives the real upload path against the fake provider. (5) It is reachable at the production URL by someone who is not the engineer. (6) **Both locales load, the switcher works, and a CI check fails on any user-facing literal outside a catalogue** — including a catalogue-parity check that fails when a key exists in one language and not the other. (7) **`1234` renders `1.234` in pt-BR and `1,234` in English**, asserted by test (R30). (8) **The same fixture analysed with the UI set to English produces identical counts** to pt-BR, asserted by test — the pipeline never reads the request locale (R31). |
| **Deferred** | Accounts, persistence, chunking, compression, lemmatisation, watchlists, series view, sharing. Most *copy* is also deferred — the mechanism is the deliverable, not a finished translation of a product that does not exist yet. |
| **Stop here?** | Thin but real: a word readout of a short clip nobody had before. Nobody would miss it. |
| **What it cost** | Two bugs that only appeared when the thing was actually used in a browser, neither of which any test would have caught: Chrome reports `application/octet-stream` for an `.m4a` picked from disk, so the route rejected real episodes as unsupported; and a media element that cannot load fires *no* event at all, so measuring the duration hung forever rather than failing. Both are fixed and both now have tests. |

### M1 — Sign in, library, full-length episodes · 3 weekends (est.)

The increment that makes it *their* app rather than a demo, and the one that makes two-hour episodes work. The biggest and riskiest thing in the plan.

| | |
|---|---|
| **Goal** | Friends sign in and upload a real two-hour episode that comes back correct and stays in a library. |
| **User-visible** | Magic-link sign-in; drag in **one file — the final edited episode**; the browser splits it on silence into ~20–25 min chunks, compresses each to 16 kHz mono Opus, uploads them, and the server transcribes them in parallel and stitches one continuous transcript; a library list with title, date and duration; delete an episode. When the hourly allowance is spent, a plain message saying so and roughly when to retry — a **typed code with a parameter** (`ALLOWANCE_EXHAUSTED{retryAfterHours}`), resolved in whichever language the reader picked, never an interpolated sentence. |
| **Checkpoints** (shippable states inside the increment, not separate increments — a one-chunk cap is of no use to a group whose episodes are all two hours) | **a)** auth + library + single-chunk episodes. **b)** chunking, compression and stitching. **c)** rate-limit handling, keep-alive, delete. |
| **Exit** | (1) A real 1 h 40 m – 2 h episode from the actual show completes end to end and the transcript reads continuously across every seam — no lost or duplicated sentences. (2) **Timestamp stitching is tested at every chunk boundary**: word timestamps land within ±1 s of hand-checked positions in a committed multi-chunk fixture, and a deliberately wrong chunk offset fails a test. (3) Chunk boundaries fall on silence, never mid-word. (4) Total wall clock for a 2-hour episode is under 300 s, measured in prod. (5) Two friends sign in by magic link and each sees only their own episodes; a cross-account read test fails closed. (6) Uploading a second 2-hour episode within the hour produces a readable "free hour is used up, try again in ~N minutes" message, never a stack trace. (7) Audio is deleted from storage once transcription succeeds (transcript is the durable artifact, ADR 0005), asserted by test. (8) A daily cron pings Supabase; the project survives an 8-day gap with no uploads. |
| **Deferred** | Watchlists, series view, sharing, the pt-BR lemma pipeline. (Speaker attribution is not deferred — it is cut. Back-catalogue import is not deferred either — it is **deleted**, Q16 resolved: only new episodes.) |
| **If stitching fights back** | Ship checkpoint (a) — real auth, real library, episodes up to one chunk — and give chunking a dedicated weekend. Do **not** let it quietly absorb a fourth and fifth weekend; re-forecast out loud instead. |
| **Stop here?** | Yes — the whole show, in one place, with per-episode word stats, usable from any device by the whole group. |

### M2 — Running jokes, on a pt-BR pipeline · 2 weekends (est., was 1)

The headline feature, and now the increment that carries the Portuguese text pipeline. A podcast group already knows its bits by name.

| | |
|---|---|
| **Goal** | Count the things the group actually cares about, in Brazilian Portuguese, with a quote behind every number. |
| **User-visible** | Name a bit once ("Guardachuva Corner" = guardachuva, guarda chuva, guardachuvas, guarda-chuva); every episode reports a count per bit; click a count → the timestamped quotes that produced it → click a quote → the transcript at that moment. A density strip showing *when* in the episode a bit clustered. The matched surface forms sit next to every count, and adding a missed one is one click. |
| **New work (pt-BR)** | A bundled lemma dictionary with a Portuguese stemmer **fallback**, and a pt-BR stop-word list. The fallback is where the danger is: a dictionary covers common words, so the words that reach the stemmer are the out-of-vocabulary ones — which is exactly what a coinage or a nickname is. This is the weekend that was added. |
| **Checkpoints** | **a)** dictionary + stop-words + bit matching with aliases, shipped. **b)** stemmer fallback behind the over-merge guard. |
| **Exit** | (1) Case, plural, hyphen and spacing variants collapse to one bit, by unit test per class — **with diacritics preserved throughout** (R29). (2) **Over-merge guard** (R28): `casa`/`casar` stay distinct, `comer` never collapses onto `com`, asserted by a committed table of pt-BR near-miss pairs; any merge the stemmer proposes and the dictionary disagrees with is not taken. (3) **Orthographic aliases** (R27): `pra`/`para`, `tá`/`está`, `né`/`não é` count as one term by default, asserted by test, so a count cannot move because Whisper chose the written-standard spelling. (4) Counts for a golden set of 2 real two-hour episodes × 10 named bits match hand counts: median error ≤5%. (5) Every count drills to quotes, and 100% of sampled quotes actually contain a matched form **at the right timestamp** — the standing regression on M1's stitching. (6) Re-running analysis on a stored transcript is free, instant, and spends no audio-seconds (ADR 0005). (7) The group names at least five real bits without being prompted with examples. (8) **Every count on screen goes through the locale formatter**, and the same episode read in English and in pt-BR shows the same numbers with the right separators for each — asserted by test (R30, R31). |
| **Deferred** | Automatic topic discovery, paraphrase/semantic matching, anything cross-episode. |
| **Stop here?** | Yes, and this is the first increment they'd be annoyed to lose. **With no back catalogue it is also the increment that has to carry the product on its own**, for the weeks before a second and third episode make M3 mean anything. |

### M3 — The series view · 1 weekend (est.)

| | |
|---|---|
| **Goal** | Answer "across episodes" — the stakeholder's actual words — and make the series the home page. |
| **User-visible** | One row per episode, one column per bit, counts in the cells; a per-bit line across the season; "compare episode to episode" picking any two and showing what rose and fell; the series view becomes the landing page after sign-in. |
| **Ships into a nearly empty library** | There is no back catalogue (Q16), so on the day M3 ships the series has however many episodes have been recorded since M1 — likely one or two. **Designed one- and zero-episode states are part of this increment, not polish**: a one-row table with a flat line is worse than a screen that says what will be here after the next episode (R32). |
| **Exit** | (1) The series view reads stored per-episode aggregates, never re-scans transcripts; 30 episodes render in <1 s. (2) Adding or editing a bit backfills counts across the whole library by recomputing from stored transcripts, with no re-transcription and no audio-seconds spent — asserted by test. (3) A two-episode comparison names the biggest movers in both directions. (4) The group can point at one thing the series view told them that they did not already know — **measured against the hand-built spreadsheet of past episodes (R16), not against the live library**, which will not hold enough episodes yet. (5) **The one-episode and zero-episode states are designed screens in both languages**, and neither renders a degenerate chart. |
| **Deferred** | The assistant, per-bit alerts. (Back-catalogue import is deleted, not deferred — Q16.) |
| **Stop here?** | Yes — this is the product the stakeholder described. If the project froze here it would have delivered, **though not immediately**: the thing it delivers only becomes visible at episode 3 or 4. |

### M4 — Rough edges, in two languages · 2 weekends (est., was 1 — hard timebox each)

> Share links were the other half of this milestone. They shipped, the group
> used them, and the group asked for them to go — so M4's exit criteria (1)
> and (2), about a stranger opening a link and revocation making it 404, are
> **withdrawn rather than met**. The rest of the milestone stands.

This is the copy increment, and copy is now the thing that exists twice. The mechanism has been in place since M0; what M4 adds is every real sentence, in both catalogues.

| | |
|---|---|
| **Goal** | Make one result shareable and the app pleasant **in both languages**. Then stop. |
| **User-visible** | "Share this" on an episode or a bit → an unguessable read-only link that works without signing in, showing **counts and the quotes behind them, never the full transcript** (Q17, decided); empty, loading and error states that read like sentences in whichever language the reader picked; a locale switcher that is findable rather than merely present; works on a phone; one line saying episode audio is sent to Groq for transcription in Portuguese, roughly how accurate to expect that to be, and that counts describe the **edited** episode. A share link opens in the recipient's browser language where it is one of ours, pt-BR otherwise — **the quotes themselves are never translated**, because they are what was said. |
| **Checkpoints** | **a)** share links, revocation, every async state designed — pt-BR catalogue complete. **b)** the English catalogue filled to parity, both locales walked on a phone. |
| **Exit** | (1) A share link opens for a signed-out stranger and exposes exactly the shared result — counts and matched quotes only; no full transcript, no library, no other episodes, no account data; asserted by test. (2) Revoking a link makes it 404. (3) Every async state has a designed screen, including `ALLOWANCE_EXHAUSTED`. (4) A friend who has never seen the app signs in and uploads an episode with no help. (5) **Catalogue parity is 100% and CI enforces it** — no key in one language and missing in the other, no fallback-language string reaching a screen. (6) **Both locales are walked end to end on a phone**, and numbers carry the right separators on every screen in both. (7) Two weekends. Unfinished polish is cut, not carried — and if something must give, **the English catalogue ships complete and the decoration goes**, because a half-translated UI is a bug and an undecorated one is not. |
| **Deferred** | Everything in *Later*. |
| **Stop here?** | Yes — this is v1, and v1 is the plan. |

---

## Later, only if the group asks

Not scheduled, not estimated, no implied order. Each needs a trigger before any work starts.

| Lane | Trigger, and what it actually involves |
|---|---|
| **Ask the series** (chat over the aggregates, Groq's free LLM, behind the one `assistant` flag) | M3 has shipped, counts are trusted, and someone keeps asking a question the series view can't answer. Counting stays in SQL — the model only phrases answers (ADR 0007). |
| Automatic bit *suggestions*; scheduled digests; RSS ingest | Real demand, stated twice, by someone other than the builder. |

**Not lanes — out of scope.** Three things are closed rather than parked, and none has a trigger:

| Out of scope | Why it is closed, not deferred |
|---|---|
| **Who talks most / speaker attribution** | There are no per-host tracks — the upload is the final edited mix — and the free stack has no diarisation. Nothing to gate on, so it is removed from the product (R24 retired). |
| **Back-catalogue import** | **Q16 resolved: only new episodes.** The stakeholder does not want the archive loaded. There is no import story, nothing to schedule and no *Later* lane — the arithmetic that used to justify one (100 audio-hours, two weeks of drip-feeding, past the 1 GB tier) is now moot rather than daunting (R26 retired). The series starts at episode 1 and grows weekly (R32). To come back, it would need the group to ask for old episodes *and* a storage answer, which is a different conversation. |
| **A second *audio* language** | The show is in Brazilian Portuguese and the **analysis pipeline** is built for it: lemma dictionary, stop-word list, aliases and golden set are all pt-BR. Analysing a show in another language would be **a different product decision** — a second dictionary, a second stop-word list, a second golden set. Not to be confused with the **interface**, which is bilingual from M0: the UI has two languages, the audio has one, and the two are deliberately unconnected (R31). |

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
| The **audio** is Brazilian Portuguese, not English | `language=pt` pinned; pt-BR lemma dictionary + stop-word list; diacritics preserved; no stemmer merge the dictionary disagrees with; orthographic aliases (`pra`/`para`) tested | M0 (cheap half) · M2 (the rest) |
| The **interface** is pt-BR *and* English, switchable | No user-facing string outside a message catalogue, enforced by a CI lint rule from the first commit; every error, warning and empty state is a **typed code with parameters**; catalogue parity enforced in CI | **M0** (mechanism) · M4 (the copy) |
| Switching the UI language must never move a number | The analysis path takes a pinned `pt-BR` constant and never reads the request locale; counts go through one locale-aware formatter; a test asserts identical counts with the UI in English | M0 · CI forever (R30, R31) |
| Only new episodes, never the archive | The series starts empty and grows one episode a week; designed zero- and one-episode states; no import UI, no progress screen, no drip-feed scheduler | M3 (R32, Q16) |
| The upload is the final edited mix | One file per episode, no track-set concept, no speaker breakdown; counts and filler/pace stats are described in-product as measuring the **published** episode | M1 · M4 copy |
| TDD throughout | Groq behind a port with a fixture-backed fake; **no test may call Groq** — the allowance is shared with real users | ADR 0004, `CLAUDE.md` |

---

## Sequence at a glance

```
                  W1  W2  W3  W4  W5  W6  W7  W8  W9  W10
pt-BR pilot      (one evening, before W1 — gates all of it)
M0 Skeleton+i18n  ███ ███
M1 Sign in + eps          ███ ███ ███
M2 Jokes + pt-BR                      ███ ███
M3 Series view                                ███
M4 Share + copy                                   ███ ███
```

| # | Increment | Weekends | Was | Ships |
|---|---|---|---|---|
| M0 | Walking skeleton — pt-BR stop-words, diacritics, **i18n mechanism** | **2** | 1 | live URL |
| M1 | Sign in, library, full-length episodes | 3 | 3 | yes |
| M2 | Running jokes, on a pt-BR pipeline | 2 | 2 | yes |
| M3 | The series view | 1 | 1 | yes |
| M4 | Share links, rough edges, **both catalogues** | **2** | 1 | **v1** |

**Total ≈10 weekends, roughly 80 hours — an estimate, up from 8.** The bilingual UI added both of them: one at M0 for the mechanism, one at M4 for the copy. **Dropping the back catalogue gave nothing back**, because it was never scheduled — it was a *Later* lane with no estimate. So the honest summary of this round is: **+2 weekends, −1 *Later* lane, −1 blocking question, and a register that goes +3 live rows / −1 retired / 1 downgraded.** Calendar-wise, three months or so of spare time.

M0–M1 are the committed part; re-forecast after M1, because chunking and stitching are the one place this plan could be wrong by a weekend or two — and after the pt-BR recall check, which could be wrong about the whole thing.

If something has to be cut, cut **M4's decoration** — before M3's series view, and before the English catalogue. A pretty single-episode page is not what was asked for, and a half-translated interface is a defect rather than an unfinished nicety.
