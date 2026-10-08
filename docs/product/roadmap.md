# Overtone — Product Roadmap

**Thesis.** People accumulate recordings — standups, 1:1s, interviews, lectures, voice notes — and lose everything in them the moment they stop playing. Overtone turns an audio file into *countable, citable facts*: how often a term came up, who talked, how that changed across weeks. The wedge is not transcription (commodity) and not summarisation (crowded); it is **trustworthy counting with a quote behind every number**. Every statistic is clickable down to the timestamped sentence that produced it, because a count nobody can verify is a count nobody acts on. That same per-recording aggregate layer is what later lets an assistant answer *"how many times did we ever discuss hotdogs?"* across a whole library cheaply — so the MVP is deliberately built as the chatbot's data substrate, without building the chatbot.

**North Star: Explored Audio Hours per week (EAH/wk)** — audio-hours whose finished analysis the uploader actually opened *and* interacted with (drill into a term, jump to a quote, add a watchlist term, export) within 7 days. One number that only moves when supply (uploads) and realised value (exploration) both happen. Rationale and rejected alternatives: [`metrics.md`](./metrics.md).

Personas, use cases, journeys, domain language and Gherkin acceptance criteria are owned by the Product Owner — [`personas.md`](./personas.md), [`use-cases.md`](./use-cases.md), [`user-journeys.md`](./user-journeys.md), [`glossary-and-domain.md`](./glossary-and-domain.md), [`backlog.md`](./backlog.md), [`definition-of-ready-and-done.md`](./definition-of-ready-and-done.md). This document sequences them; it does not restate them. The MVP persona is **P1 Maya**, a recurring-meeting owner whose stated bar is *≤3 minutes from file-on-disk to a readable answer, with every number clickable back to a timestamped quote* — that bar is the source of the TTFI and quote-drill targets below. Stack decisions live in [`docs/adr/`](../adr/); where a product decision constrains them it is flagged.

**Increment ↔ epic mapping.** M0 is epic E1 (`US-001`…`US-005`); later increments draw from `backlog.md` in its stated order. Shared constants (200 MB / 120 min, top-25 words, English-only, the six processing statuses) are defined once in `backlog.md` and `glossary-and-domain.md` — this roadmap uses them, it does not redefine them.

---

## Walking skeleton (M0)

The thinnest slice that is genuinely end-to-end and genuinely deployed:

> Open the production URL → drag in one 3-minute MP3 → wait → see a real transcript excerpt and one real statistic (top 25 terms by count, stopwords stripped) rendered in the browser.

**Intentionally crude, and we say so out loud:**

| Crude thing | Why it's acceptable at M0 |
|---|---|
| Synchronous request, browser spins for ~30–60 s | Proves the pipeline before we pay for a queue |
| One file at a time, nothing persisted but the latest result | Storage model is M1's job, not M0's |
| 25 MB / 10 min hard ceiling, MP3+WAV only | Keeps the first real ASR bill under $1 |
| Single shared access secret, no accounts | But the data model gets `user_id` at M1 — see Q1 |
| Naive whitespace tokenising + a stopword list; no stemming, no synonyms | Exposes the normalisation problem early (R2) instead of hiding it |
| Unstyled table, no charts, no empty/error states | "Nice UI" is M4 and is timeboxed |
| No retries, no cancel, failures show a raw error string | Honest failure beats a fake progress bar |

**Non-negotiable even at M0:** real transcription (local `whisper.cpp`) behind an interface with a fixture-backed test double, CI green, TDD from the first commit, and a recorded throughput benchmark. *Amended by ADR 0009:* the original "deployed to a real URL" and "ASR spend alert" criteria are dropped — there is no spend to alert on, and free hosting tiers cannot run local inference. M0 exits on `localhost`; deployment moves to whenever there is a second user. This is the one place the roadmap regresses, consciously.

---

## Increments

### M0 — Walking Skeleton · ~1 week (est.)

| | |
|---|---|
| **Goal** | Prove upload → real transcript → one real statistic → rendered, in production. |
| **User-visible** | A page that takes one audio file and returns a top-25-term table plus the transcript. |
| **Exit criteria** | (1) A 3-min file uploaded from a phone browser returns a term table in <90 s p95. (2) Term counts for a committed fixture match a hand-counted expectation exactly, asserted in CI (`US-004`). (3) One e2e smoke test drives the real upload path against `FakeTranscriptionProvider`. (4) A recorded benchmark: minutes of wall-clock per audio hour on this machine, for the model chosen — the number that decides whether M1's queue is urgent. (5) ≥1 recording from the named design partner (Q9) processed successfully. |
| **Deferred** | Accounts, persistence, async jobs, topics, speakers, charts, retries, any file >10 min. |
| **Stop-here value?** | Thin but real — a user can get a word-frequency readout of a short recording they could not get before. Not retainable. |

### M1 — Library & Reliable Pipeline · ~3 weeks (est.)

| | |
|---|---|
| **Goal** | Make it survivable: real accounts, durable library, async jobs that recover from failure. |
| **User-visible** | Sign in; upload a 120-minute meeting; see it move `uploaded → transcribing → analyzing → ready` with live status; a library list of past recordings you can revisit; retry a `failed` one yourself; delete a recording. |
| **Exit criteria** | (1) A 120-minute / 200 MB file completes without a request timeout. (2) Direct-to-storage upload (ADR 0008) resumes or clearly fails on a killed network — no silent half-uploads, and `/complete` probes the blob for real duration and format rather than trusting the client. (3) Submitting the same file twice creates one job and one ASR charge — idempotency on content hash asserted by test. (4) Injected ASR 500 / timeout / malformed-response each produce a retried-then-`failed` job with a user-readable message, never a stuck `transcribing`; the 3× duration hard timeout forces `failed`. (5) Delete removes DB rows *and* the audio blob, verified by test; unconfirmed blobs are swept after 24 h. (6) Processing success rate ≥98% over ≥30 real uploads. (7) All queries scoped by `user_id`; a cross-tenant read test fails closed. |
| **Deferred** | Topics/watchlists, speakers, charts, cross-recording views, sharing, non-English. |
| **Stop-here value?** | Yes — a personal archive of meetings with per-recording word stats you can return to. Weakly retainable. |

### M2 — The Insight Layer · ~3 weeks (est.)

| | |
|---|---|
| **Goal** | Turn word counts into answers: watched topics, counted properly, with a quote behind every number. |
| **User-visible** | Define a topic ("Pricing" = pricing, price, discount, rate card) once; every recording reports mention counts per topic; click a count → the list of timestamped quotes that produced it → click a quote → transcript at that point. Mention-density strip showing *when* in the recording a topic clustered. |
| **Exit criteria** | (1) Golden set of 10 real recordings × 20 terms with hand-labelled counts; median per-term count error ≤5%, p90 ≤15%. (2) Case, plural, hyphen and spacing variants ("hotdog/hot dog/hot-dogs") collapse to one topic, by test. (3) Every count drills to quotes; 100% of sampled quotes actually contain the term. (4) Re-running analysis on an existing transcript costs $0 in ASR and is a no-op at the same `pipeline_version` (ADR 0005) — the transcript is the durable artifact, counting is cheap and re-runnable. (5) Design partner confirms ≥1 topic count changed a decision or a follow-up. |
| **Deferred** | Automatic topic discovery, semantic/paraphrase matching, speakers, cross-recording trends. |
| **Stop-here value?** | Yes, and this is the first increment a user would miss if taken away — it answers the stakeholder's literal question for a single recording. |

### M3 — Speakers & Trends · ~3 weeks (est.)

| | |
|---|---|
| **Goal** | Add the two dimensions the brief names — *who* and *over time* — and build the chatbot's aggregate store as a side effect. |
| **User-visible** | Talk-time share per speaker with renameable labels ("Speaker 2" → "Priya"); a library-wide trend chart for any topic by week; comparison across recordings. |
| **Exit criteria** | (1) Diarisation shipped labelled **beta** with a visible caveat, capped at ≤4 speakers; talk-time share within ±10 percentage points of hand-labelled truth on 5 test files, else the feature stays off. (2) Trend query over 50 recordings returns in <1 s p95 from stored per-recording aggregates — no transcript re-scan. (3) Renaming a speaker updates every view, by test. (4) Aggregates are recomputed, not re-transcribed, when a topic definition changes. |
| **Deferred** | Per-speaker topic attribution ("who said hotdogs most"), overlap/interruption analysis, >4 speakers. |
| **Stop-here value?** | Yes — "I talk 70% of my 1:1s" and "pricing came up 4× more this month" are standalone insights. |

### M4 — v1: Polish, Trust & Launchable · ~2 weeks (est., hard timebox)

| | |
|---|---|
| **Goal** | Make it something you'd show a stranger, and honest about its limits. |
| **User-visible** | Coherent visual system, real charts, empty/loading/error/partial states, responsive, keyboard-navigable; onboarding that gets a first upload done in <2 min; a visible accuracy & consent notice; self-serve export (CSV/PNG) and account-wide data deletion. |
| **Exit criteria** | (1) The pre-agreed 10-item UI checklist and two reference products (Q10) are satisfied — checklist signed off, no open-ended polish. (2) Every async state has a designed screen, verified by a state-gallery test. (3) Time-to-first-insight for a new user p50 <2 min for a 10-min file. (4) "Delete my account and data" completes and is verified to leave zero audio blobs and zero transcript rows. (5) Lighthouse a11y ≥90; WCAG AA contrast on charts. (6) 5 external users complete a first upload unassisted. |
| **Deferred** | Teams/sharing, billing, the assistant, non-English. |
| **Stop-here value?** | Yes — this is a shippable v1 product. If the project froze here it would still be worth using and worth charging for. |

### M5 — Ask Your Library (AI assistant, behind a flag) · ~3 weeks (est.)

| | |
|---|---|
| **Goal** | Answer "how many times did they *ever* discuss hotdogs?" across the whole library — cheaply, with citations. |
| **User-visible** | A chat panel that answers count, trend, speaker and recall questions over the full library and cites the recordings/timestamps it counted, with a "show the 12 quotes" affordance. |
| **Exit criteria** | (1) Answers route to the aggregate store first; naive whole-library context stuffing is impossible by construction. (2) Median cost per answered question ≤$0.03 and p95 ≤$0.10 (est.); per-user daily cap enforced with a friendly ceiling message. (3) 20-question eval set (counts, trends, "who said", not-mentioned, ambiguous); ≥90% numerically correct, 0 fabricated citations — every cited timestamp resolves to real text containing the claim. (4) Refuses or flags rather than guessing when the library has no coverage. (5) Flag default **off**; global kill switch tested in production. (6) Rollout: self → 3 friendly users → 25% → all, per [`release-strategy.md`](./release-strategy.md). |
| **Deferred** | Multi-turn memory across sessions, chart generation from chat, actions/write-back, voice input. |
| **Stop-here value?** | Yes — and if the eval bar fails, the flag stays off and v1 is unharmed. That's the point of doing it last. |

### M6 — Beyond · ~4 weeks (est., pick by evidence)

| | |
|---|---|
| **Goal** | Reduce the cost of getting audio in, and of sharing what comes out. One lane, chosen by M4/M5 data — not all of them. |
| **User-visible** | **(a)** Ingest integrations (Zoom/Meet/Drive/RSS) so uploading stops being manual; **(b)** sharing & teams — a read-only insight link, then shared libraries; **(c)** second language with a measured accuracy bar; **(d)** scheduled digests ("your week in topics"). |
| **Exit criteria** | Chosen lane ships end-to-end with its own exit bar; the deciding metric is named *before* work starts (e.g. integrations only if manual upload is the top drop-off in the M4 funnel). |
| **Deferred** | Everything not chosen; mobile apps; realtime/live transcription. |
| **Stop-here value?** | Yes by construction — each lane is independently shippable. |

---

## Product decisions that constrain the stack

Architecture owns the choices; these are the constraints it must satisfy. Most are already honoured by an accepted ADR — the right-hand column says which, so a future reversal is traceable to the product reason that caused it. (See [`open-questions.md`](./open-questions.md).)

| Product decision | Constraint it imposes | Satisfied by |
|---|---|---|
| Real accounts from M1 | `user_id` on every row and query from M1; cross-tenant isolation testable. Retrofitting this later is a rewrite. | open (Q1) |
| 120-min files | Background execution beyond request timeouts; rules out doing ASR in a request handler. | ADR 0003 (durable queue in Postgres) |
| 200 MB uploads | Presigned direct-to-storage upload; bytes must not transit the app server. | ADR 0008 |
| Deletion guarantee (GDPR-style) | Every audio blob addressable from a DB row; no orphan storage paths, ever. | ADR 0008 (24 h orphan sweep) |
| Transcript is the durable artifact | Counting re-runs for free; changing a topic definition must never re-bill ASR. | ADR 0005 (`pipeline_version`), ADR 0004 (raw payload kept) |
| Library-wide chat at M5 | Per-recording aggregates stored queryably from M2; transcript segments addressable by timestamp; the model must never do the arithmetic. | ADR 0007 (tool use, not RAG) |
| Counts must be explainable to the user | Deterministic matching over a user-defined watchlist; no non-reproducible clustering in the counting path. | ADR 0006 |
| TDD throughout | ASR/LLM behind ports with fixture-backed fakes; no test may hit a paid API. | ADR 0004, `CLAUDE.md` |
| Cost caps | Spend metering per user and per job from M1, not bolted on at M5. | open (Q7) |

---

## Sequence at a glance

```
                        1111111111
                       1234567890123456789   (week, 1 engineer, est.)
M0 Walking Skeleton    █
M1 Library & Pipeline   ███
M2 Insight Layer           ███
M3 Speakers & Trends          ███
M4 v1 Polish & Trust             ██
M5 AI Assistant (flag)             ███
M6 Beyond                             ████
```

| # | Increment | Weeks | Start | End | Cumulative | Ships to users |
|---|---|---|---|---|---|---|
| M0 | Walking Skeleton | 1 | W1 | W1 | W1 | Yes (design partner) |
| M1 | Library & Reliable Pipeline | 3 | W2 | W4 | W4 | Yes |
| M2 | Insight Layer | 3 | W5 | W7 | W7 | Yes — core promise met |
| M3 | Speakers & Trends | 3 | W8 | W10 | W10 | Yes (diarisation beta) |
| M4 | v1 Polish & Trust | 2 | W11 | W12 | W12 | Yes — **v1.0** |
| M5 | AI Assistant | 3 | W13 | W15 | W15 | Staged, flagged |
| M6 | Beyond (one lane) | 4 | W16 | W19 | W19 | Yes |

**Total ≈19 weeks (~4.5 months) for one engineer with AI assistance — an estimate.** Treat M0–M2 (7 weeks) as the committed plan and M3–M6 as directional; re-forecast after M2 with real throughput. The most likely slip is M2 (count-accuracy work is open-ended — see R1/R2); if it slips, cut M3's trends before cutting M2's quote-level verification, because unverifiable counts make the whole product pointless.
