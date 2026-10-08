# Overtone — Metrics

A hobby app for one podcast group whose episodes run 1 h 40 m – 2 h, **recorded in Brazilian Portuguese** and read in **pt-BR or English**. Every metric here must be readable from a single SQL query or one log line, or it does not belong.

Targets are **estimates until there are ~10 real episodes in the library** — and with only new episodes going in (Q16 resolved), **that is about ten weeks away, not ten days.** Every target below is therefore unfalsifiable for the first couple of months. That is a property of the plan, not a flaw in the metrics; it is called out again under the North Star because it is the single easiest thing here to misread.

There are **no cost metrics**. The stack is free; cost per audio hour, monthly burn and cost per user are retired — see [`risks.md`](./risks.md).

**Three things every number here is measured against.** First, the input is the **final edited mix**, so every count describes the **published episode, not the raw conversation** — anything the edit cut was never said as far as Overtone can tell, and any filler-word or pace figure measures the *edit*, not how someone talks. Say that next to the number rather than letting a reader assume otherwise. Second, there is **no speaker dimension** at all (ADR 0015), so no metric here splits by host and none ever will. Third, **no number on this page may depend on the reader's interface language.** The audio is pt-BR and the analysis is pt-BR; the UI is pt-BR *or* English (ADR 0017). The separators change, the quantity does not — a count that moved because someone switched language is a defect, not a different view (R30, R31).

---

## North Star: Compared Episodes per Month (CEM)

**Definition.** Episodes that (a) finished processing and (b) whose **series view** was opened by someone in the group within 7 days of landing.

**Why this one.** The stakeholder's ask was *across episodes* and *compare episode to episode*. CEM only moves if the group keeps uploading **and** keeps looking across the series — the two halves of the promise, in one number. It stays at zero if uploads stop, if processing breaks, or if the series view turns out to be uninteresting, which are exactly the three ways this project fails. **And it also stays at zero when there is simply nothing to compare yet** — which, with no back catalogue, is the situation for the first few weeks of the product's life. That fourth cause is not a failure and must not be read as one; see below.

| Alternative | Why not |
|---|---|
| Episodes uploaded / month | Counts effort, not value. Stays healthy while the output is ignored. |
| Audio hours processed | The old cost driver dressed as traction. Now it mostly measures episode length. |
| Weekly actives | A handful of users. Noise only. |
| Page views of any kind | A word table "views" fine and tells you nothing. |

**Trajectory (est.):** once there are several episodes, CEM should equal the show's release cadence — every new episode landing and somebody looking across the series.

### Reading CEM early — the easiest thing on this page to get wrong

The series starts empty and grows one episode at a time (Q16 resolved, R32). CEM is a **comparison** metric, so it is *structurally incapable* of moving until a second episode exists and carries no information until the third or fourth. Its first readings are a calendar, not a product signal.

| When | Expected CEM | What a zero means there |
|---|---|---|
| M3 ships, 1 episode in the library | **0, and correct** | Nothing to compare. Do not investigate it and do not iterate on the series view off the back of it — the number has no content yet |
| Episode 2 lands | 1, if someone opened the series view | The first reading with any information in it. One data point; treat it as anecdote |
| Episodes 3–4, ~1 month in | approaching the release cadence | The first point at which a **low** CEM is evidence rather than arithmetic |
| 2 months, ≥4 episodes, at or above cadence | = cadence | Working as intended |
| 2 months, ≥4 episodes, **below** cadence | — | *Now* it is a signal: the series view isn't landing. Go ask why rather than building more of it (R16) |

**Reporting rule:** always state CEM **next to the number of episodes available to compare**. CEM without that denominator is uninterpretable for the first two months — which is exactly when it will be looked at hardest.

---

## One metric per increment

| # | Metric | Definition | Target (est.) |
|---|---|---|---|
| — | **pt-BR recall pilot** (before M0, gates everything) | Recall on a hand-listed set of in-joke terms and proper nouns, from ten minutes of one real episode through Groq at `language=pt` | ≥85%; below that, re-plan the product before writing code (R1) |
| M0 | Clip processed end to end | Real pt-BR clips returning a transcript and a count table in prod | ≥3, one uploaded by someone other than the builder |
| M0 | Count fidelity | Term counts vs a hand-counted committed **pt-BR** fixture | 100% exact, asserted in CI |
| M0 | **Diacritic fidelity** | `e`/`é` and `por`/`pôr` counted as distinct terms | pass, permanent in CI (R29) |
| M0 | **Catalogue parity** | Keys present in `messages/pt.json` *and* `messages/en.json`; user-facing literals outside a catalogue | 100% parity both directions and **zero literals**, asserted in CI by test and lint (ADR 0017) |
| M0 | **Number formatting per locale** | `1234` rendered through the one formatter in each locale | `1.234` (pt) and `1,234` (en), asserted in CI (R30) |
| M0 | **Counts invariant under UI locale** | One fixture analysed with the interface set to pt, then to en | **byte-identical** counts, matched surface forms and normalisation version, asserted in CI (R31) |
| M1 | Full-length episode completes | 1 h 40 m – 2 h episodes chunked, compressed, transcribed in parallel, stitched, stored | ≥3 real episodes, 0 lost or duplicated sentences at any seam |
| M1 | **Seam timestamp accuracy** | Word timestamps vs hand-checked positions at every chunk boundary | within ±1 s, asserted in CI on a multi-chunk fixture |
| M1 | Friends signed in | Distinct accounts with ≥1 episode | ≥2 |
| M2 | **Bit count accuracy** | median \|counted − hand-counted\| ÷ hand-counted, 2 two-hour episodes × 10 named bits | median ≤5% |
| M2 | **Orthographic stability** | Counts from a colloquial-only fixture vs a written-standard-only fixture of the same speech | identical, asserted in CI (R27) |
| M2 | **Over-merge rate** | pt-BR near-miss pairs (`casa`/`casar`, `com`/`comer`) that the matcher collapses | 0, asserted in CI (R28) |
| M2 | Bits defined | Named running jokes/topics in the library | ≥5, named by the group unprompted |
| M3 | Series view opens | Opens of the series view per new episode | ≥1 per episode — **measurable only from episode 2** (R32) |
| M3 | Series query latency | Series view render over 30 episodes, from stored aggregates | <1 s, measured against a **synthetic 30-episode fixture** — the real library will not hold 30 for months, so this is a performance test and not an observation |
| M3 | **Empty and single-episode states** | The zero- and one-episode series screens, in both languages | designed screens, no degenerate chart, asserted by test (R32) |
| M4 | Share links opened | Shared results opened by someone signed out | ≥1 (it is either used or it was wrong to build) |
| M4 | Unassisted first upload | A friend who has never seen the app signs in and uploads with no help | 1/1 |
| M4 | **Both locales walked** | Every screen reached end to end on a phone in pt-BR and in English | 2/2 complete, no fallback-language string on screen, no mis-separated number |

---

## Health (watch weekly, 5 minutes)

| Metric | Target (est.) | Alarm |
|---|---|---|
| Episode success rate | ≥95% of uploads reach a readable result | any episode silently truncated, or a seam that lost a sentence |
| Upload → result wall clock, 2-hour episode | <120 s including browser compression (~45 s of Groq work across ~5 parallel chunks) | >300 s — the Vercel request limit is in play |
| Keyword recall on named bits (pt-BR) | ≥90% of bits truly said **in the published episode** are surfaced | <85%, or any bit the group insists was said and isn't counted |
| Unmatched surface forms per bit | ≤3 forms the ASR produced that no alias catches | >3 on any bit — the alias list is behind the transcriber (R2, R27) |
| Quote-timestamp spot check | 5 random quotes per new episode land where they claim | any mismatch — that is the stitching bug (R22), stop and fix |
| Low-confidence episodes | ≤15%, each visibly flagged | any unflagged low-confidence episode (a quiet wrong number) |
| Trust incidents | 0 reports of "that number is wrong" per 10 episodes | any wrong count traced to a bug rather than to the audio |
| **Catalogue parity** | 100%, both directions, enforced in CI | any string rendering in the fallback language, or a missing-message key reaching a screen (ADR 0017) |
| **Episodes available to compare** | grows by the show's release cadence | no new episode for 3 weeks — CEM will read zero, and the cause is the show's schedule rather than the app (R32). Check this **before** investigating a flat North Star |
| Free-tier headroom — Groq | **capacity, not money.** Audio-seconds used against 7,200/hour and 28,800/day; one 2-hour episode spends a whole hour | any 429 reaching a user as an error rather than as a message |
| Free-tier headroom — Supabase | File storage against 1 GB (only in-flight audio should be there), DB against 500 MB, days since last DB activity | storage >500 MB, DB >250 MB, or ≥5 idle days (the project pauses at 7) |

---

## Anti-metrics — explicitly not tracked

| Anti-metric | Why not |
|---|---|
| Any cost or spend figure | There is none. A metric for $0 is theatre. |
| Audio hours / minutes transcribed | Usage, not value. Mostly a function of how long the episodes are. |
| Signups, sessions, time on page | A handful of friends. Confusion and interest look identical here. |
| Top-word impressions | Mostly stopwords. The party trick, not the product. |
| Number of bits auto-suggested | Rewards generating noise. Five bits the group actually says beat forty guesses. |
| Test count, coverage %, commits, LOC | Process exhaust. TDD and small commits are how we work, not a score. |
| NPS, satisfaction surveys | It's your friends. Ask them. |
| Anything split by speaker — talk share, words per host, interruptions | There is no speaker dimension. One edited file, no per-host tracks (ADR 0015). A number here would be invented. |
| Filler rate presented as a speech habit | The audio is post-edit, so the figure measures the **editor**. Counting fillers is fine; attributing them to how someone talks is not. |
| Translation progress as a percentage | Catalogue parity is **binary and enforced in CI**: either every key exists in both languages or the build is red. "87% translated" is a progress bar for a gate that does not accept 87%. |
| Anything split by interface language | Two friends and two languages. Which language someone reads the app in tells us nothing — and no count may vary by it in the first place (R31), so a split would only ever confirm that the tests work. |

**Standing rule:** any number that can improve without the group getting a more trustworthy answer is vanity. Say so out loud instead of reporting it.
