# Overtone — Metrics

Targets are **estimates** until we have ≥30 real uploads and ≥10 real users; re-baseline after M2 and after M4. Every metric below must be instrumentable by one engineer in under an hour, or it does not belong here.

---

## North Star: Explored Audio Hours per week (EAH/wk)

**Definition.** Sum of the audio duration (hours) of recordings that (a) completed processing and (b) whose owner performed ≥1 *insight interaction* within 7 days of completion. Insight interaction = drill from a count into quotes · jump to a transcript timestamp · add/edit a watchlist topic · change the trend window · export · (from M5) ask a question answered from that recording. Mere page-open does not count.

**Why this one.** It is the only single number that breaks if any link in the chain breaks: no uploads → zero; processing failures → zero; garbage transcripts → counts don't get explored → zero; ugly or confusing UI → no interaction → zero. It is also duration-weighted, so it rewards being trusted with the user's *important* 90-minute meeting rather than a 20-second test clip.

| Alternative | Why not |
|---|---|
| Uploads / week | Counts intent, not value. Stays healthy while the transcript is unusable. |
| Minutes transcribed | That's the cost driver. Retries and mistakes inflate it. Optimising it is optimising the bill. |
| WAU / MAU | Too coarse and too lagging at n≈10–50 users; noise swamps signal, and it can't tell "looked" from "got an answer". |
| Insights viewed | Rewards rendering, not usefulness; a stopword table "views" fine. |
| Chat messages (M5) | Doesn't exist until W13, and rewards chattiness over answered questions. |
| Retention alone | Right instinct, lagging by weeks — too slow a feedback loop for weekly increments. |

**Trajectory (est.):** M2 ≥5 EAH/wk from 1–3 design partners · M4 ≥40 EAH/wk from ~10 users · M6 ≥150 EAH/wk.

---

## Per-increment metrics

Each increment has **one input metric** (did we create the chance for value?) and **one output metric** (did value happen?). If the output metric can't be read on exit day, the increment isn't done.

| # | Metric | Type | Definition | Instrumentation | Target (est.) |
|---|---|---|---|---|---|
| M0 | Pipeline completion | out | Real recordings processed end-to-end without manual intervention | Server log line per job terminal state | ≥3, incl. ≥1 from the design partner |
| M0 | Count fidelity (fixture) | out | Exact match of term counts vs hand-counted fixture | CI assertion | 100% exact |
| M0 | Wall-clock to result | in | Upload-complete → table rendered, 3-min file | Client timestamp pair | <90 s p95 |
| M1 | Processing success rate | out | recordings reaching `ready` ÷ submitted, excl. user-cancelled | Job state table, daily rollup | ≥98% |
| M1 | Retry-rescued rate | out | jobs reaching `ready` only after ≥1 retry ÷ ready | Attempt counter on job row | report only; >15% = pipeline smell |
| M1 | Upload success rate | in | completed uploads ÷ started uploads | Client events `upload_start`/`upload_done` | ≥95% (≥90% on files >200 MB) |
| M1 | Return visits | out | users who open a recording ≥24 h after it finished | Session + recording-open events | ≥50% of users |
| M2 | **Count accuracy** | out | median \|counted − hand-labelled\| ÷ hand-labelled, 10 recordings × 20 terms | Golden-set script, run in CI nightly | median ≤5%, p90 ≤15% |
| M2 | Quote-drill rate | out | finished recordings where the owner drilled ≥1 count into quotes | Click event on count cell | ≥60% |
| M2 | Watchlist adoption | in | users with ≥1 user-defined topic | Topic table count by user | ≥70% of active users |
| M2 | Topics per user | in | median active topics | Topic table | 3–8 (below 3 = unclear value; above 20 = we built a tagging tool) |
| M3 | Talk-time accuracy | out | abs. error in speaker share vs hand-labelled, 5 files | Golden-set script | within ±10 pp, else ship off |
| M3 | Trend view usage | out | users opening a cross-recording trend ≥1×/week | Route + event | ≥40% of users with ≥3 recordings |
| M3 | Aggregate query latency | in | p95 trend query over 50 recordings | Server timing log | <1 s |
| M3 | Speaker renames | in | diarised recordings with ≥1 renamed speaker | Event | ≥30% (proxy for "labels are plausible enough to fix") |
| M4 | Time-to-first-insight (new user) | out | signup → first statistic rendered, 10-min file | Funnel events | p50 <2 min, p90 <5 min |
| M4 | Unassisted first upload | out | external testers completing upload with no help | Manual, 5 testers | 5/5 |
| M4 | Onboarding drop-off | in | largest single-step loss in signup→upload→insight | Funnel events | no step >25% loss |
| M4 | Upload-again (14 d) | out | users uploading a 2nd recording ≤14 d after the 1st | Cohort query | ≥40% |
| M5 | Answer correctness | out | eval-set questions numerically correct | 20-question eval suite in CI | ≥90% |
| M5 | Citation integrity | out | cited timestamps whose text actually supports the claim | Automated check + spot audit | 100% / 0 fabrications |
| M5 | Cost per answered question | in | LLM + retrieval spend ÷ answers | Per-call spend meter, from `usage` on every call | median ≤$0.05, p95 ≤$0.15 (Opus 5 at $5/$25 per MTok, stable tool-def prefix cached) |
| M5 | Questions per active user / wk | in | answered questions ÷ weekly active users | Event | ≥3 (below = nobody needed it; kill the flag) |
| M6 | Lane-specific | out | Named *before* work starts (e.g. integrations: % uploads arriving automatically ≥50%) | TBD at M6 | TBD |

---

## Product health (tracked from M1, reviewed weekly)

| Metric | Definition | Target (est.) | Alarm |
|---|---|---|---|
| Time-to-first-insight (TTFI) | Upload-complete → analysis viewable. Maya's stated bar is the target, not a normalised ratio | **p50 ≤3 min, p95 ≤8 min for a 60-min recording** (≈0.05×/0.13× duration) | p95 >15 min, or >0.3× duration |
| Transcription accuracy proxy | **Keyword recall** on the golden set: watched terms correctly surfaced ÷ terms truly spoken. Preferred over WER because counting cares about one word, not the average word. WER tracked secondarily on 3 reference files. | recall ≥90%; WER ≤12% clean single-speaker, ≤20% meeting-grade | recall <85% |
| Low-confidence recording rate | Recordings whose mean ASR confidence is <70/100 (the `backlog.md` quality-warning threshold) ÷ all processed. The cheap in-product proxy for R1/R18 — available on every recording, unlike the golden set | ≤15%; each one visibly flagged in the UI | >30%, or any unflagged low-confidence recording |
| Processing success rate | See M1 | ≥98% at M1, ≥99.5% at v1 | <95% on any day |
| Stuck-job rate | jobs in non-terminal state >3× expected duration | 0 | ≥1 |
| Cost per audio hour (all-in) | (ASR + storage + compute + LLM) ÷ audio hours processed, monthly | ≤$0.50/hr at v1 | >$1.00/hr |
| — ASR component | provider spend ÷ audio hours | $0.10–$0.40/hr (est.; hosted Whisper-class ≈$0.36/hr list, fast/batch tiers ≈$0.04–0.26/hr — verify at purchase) | >$0.45/hr |
| — LLM component | assistant spend ÷ audio hours in library | ≤$0.05/hr | >$0.15/hr |
| — Storage | audio+transcript GB-month ÷ audio hours (64 kbps mono ≈28 MB/hr ⇒ ≈$0.001/hr-month) | negligible | >$0.01/hr |
| Monthly infra burn | fixed hosting + DB + storage | ≤$75/mo pre-v1 (est.) | >$120/mo |
| Cost per active user / mo | all-in variable + fixed ÷ active users | ≤$5 | >$12 |
| Upload-again retention | W1→W2, W1→W4 cohort upload retention | W2 ≥40%, W4 ≥25% | W4 <15% |
| Library depth | median recordings per user at day 30 | ≥5 (below this the "ever" question has nothing to chew on) | <3 |
| Insight→quote ratio | quote drills ÷ counts displayed-and-clicked-at-all | ≥0.3 | <0.1 (counts aren't believed, or aren't interesting) |
| Trust incidents | user-reported wrong number, wrong speaker, or bad quote | ≤1 per 50 recordings | any count error traced to a code bug |

**Review cadence.** Weekly: health table + North Star, 15 minutes, written one-liner per red row. Per increment exit: the two increment metrics, pass/fail, no negotiation. Monthly: cost per audio hour vs plan, and one qualitative session with a real user — which is not a metric and is not a substitute for one.

---

## Anti-metrics — explicitly not optimised

| Anti-metric | Why we refuse it |
|---|---|
| Total minutes/hours transcribed | A cost line dressed as traction. Grows fastest when we're retrying failures. |
| Signups | Free to inflate, says nothing about a processed recording. |
| Page views, sessions, time-on-page | Longer time staring at a dashboard is as likely confusion as insight. |
| Words in transcript / transcript volume | Output of the vendor, not of the product. |
| Number of topics auto-discovered | Rewards generating noise. Three useful topics beat forty. |
| Word-cloud / top-term impressions | The party-trick metric. Mostly stopwords; near-zero decision value (R16). |
| Chat messages sent (M5) | Confusion produces messages. We count *answered, correct, cited* questions instead. |
| Feature count / "% of features used" | Invites building wide and shallow. |
| Test count, code coverage %, commit count, LOC | Process exhaust. TDD and small commits are constraints we hold ourselves to, not scores we post. |
| NPS at n<30 | Statistically meaningless at our scale; we use the upload-again behaviour instead. |
| Model/vendor benchmark scores | Vendor WER on LibriSpeech-grade audio does not predict counts on a phone in a meeting room. Only our golden set counts. |
| Uptime as a headline | Table stakes, watched via alerts, not celebrated as progress. |

**Standing rule:** any metric that can be improved without a user getting a more trustworthy number is a vanity metric, and we will say so out loud rather than report it.
