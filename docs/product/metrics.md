# Overtone — Metrics

A hobby app for one podcast group whose episodes run 1 h 40 m – 2 h. Every metric here must be readable from a single SQL query or one log line, or it does not belong. Targets are **estimates** until there are ~10 real episodes in the library.

There are **no cost metrics**. The stack is free; cost per audio hour, monthly burn and cost per user are retired — see [`risks.md`](./risks.md).

---

## North Star: Compared Episodes per Month (CEM)

**Definition.** Episodes that (a) finished processing and (b) whose **series view** was opened by someone in the group within 7 days of landing.

**Why this one.** The stakeholder's ask was *across episodes* and *compare episode to episode*. CEM only moves if the group keeps uploading **and** keeps looking across the series — the two halves of the promise, in one number. It stays at zero if uploads stop, if processing breaks, or if the series view turns out to be uninteresting, which are exactly the three ways this project fails.

| Alternative | Why not |
|---|---|
| Episodes uploaded / month | Counts effort, not value. Stays healthy while the output is ignored. |
| Audio hours processed | The old cost driver dressed as traction. Now it mostly measures episode length. |
| Weekly actives | A handful of users. Noise only. |
| Page views of any kind | A word table "views" fine and tells you nothing. |

**Trajectory (est.):** after M3, CEM should equal the show's release cadence — every new episode landing and somebody looking across the series. Below cadence for two months running means the series view isn't landing; go ask why rather than building more of it.

---

## One metric per increment

| # | Metric | Definition | Target (est.) |
|---|---|---|---|
| M0 | Clip processed end to end | Real clips returning a transcript and a count table in prod | ≥3, one uploaded by someone other than the builder |
| M0 | Count fidelity | Term counts vs a hand-counted committed fixture | 100% exact, asserted in CI |
| M1 | Full-length episode completes | 1 h 40 m – 2 h episodes chunked, compressed, transcribed in parallel, stitched, stored | ≥3 real episodes, 0 lost or duplicated sentences at any seam |
| M1 | **Seam timestamp accuracy** | Word timestamps vs hand-checked positions at every chunk boundary | within ±1 s, asserted in CI on a multi-chunk fixture |
| M1 | Friends signed in | Distinct accounts with ≥1 episode | ≥2 |
| M2 | **Bit count accuracy** | median \|counted − hand-counted\| ÷ hand-counted, 2 two-hour episodes × 10 named bits | median ≤5% |
| M2 | Bits defined | Named running jokes/topics in the library | ≥5, named by the group unprompted |
| M3 | Series view opens | Opens of the series view per new episode | ≥1 per episode |
| M3 | Series query latency | Series view render over 30 episodes, from stored aggregates | <1 s |
| M4 | Share links opened | Shared results opened by someone signed out | ≥1 (it is either used or it was wrong to build) |
| M4 | Unassisted first upload | A friend who has never seen the app signs in and uploads with no help | 1/1 |

---

## Health (watch weekly, 5 minutes)

| Metric | Target (est.) | Alarm |
|---|---|---|
| Episode success rate | ≥95% of uploads reach a readable result | any episode silently truncated, or a seam that lost a sentence |
| Upload → result wall clock, 2-hour episode | <120 s including browser compression (~45 s of Groq work across ~5 parallel chunks) | >300 s — the Vercel request limit is in play |
| Keyword recall on named bits | ≥90% of bits truly said are surfaced | <85%, or any bit the group insists was said and isn't counted |
| Quote-timestamp spot check | 5 random quotes per new episode land where they claim | any mismatch — that is the stitching bug (R22), stop and fix |
| Low-confidence episodes | ≤15%, each visibly flagged | any unflagged low-confidence episode (a quiet wrong number) |
| Trust incidents | 0 reports of "that number is wrong" per 10 episodes | any wrong count traced to a bug rather than to the audio |
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

**Standing rule:** any number that can improve without the group getting a more trustworthy answer is vanity. Say so out loud instead of reporting it.
