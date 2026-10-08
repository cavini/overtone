# Overtone — Open Questions & Decisions

Most of this document used to be about money, vendors and lawyers. The stakeholder has settled the product — *a free hobby app for a podcast a group records together **in Brazilian Portuguese**, friends sign in with a magic link, any single result shareable by link* — and the free stack (Groq + Vercel Hobby + Supabase) settled the rest. Those questions are closed below, with their answers, because the answers are now constraints.

Three closed this round, and two of them cost real scope: **the show is in Brazilian Portuguese** (Q5 — new pipeline, one extra weekend, four new risks), **there are no per-host tracks** (Q13 — speaker attribution cut outright), and **share links show counts and quotes, not transcripts** (Q17).

**Recommendation** = the PM's default. If nobody decides by the "settle by" date, we proceed with it. **Two questions are genuinely still open**, and one of them is a single message to the stakeholder.

---

## Still open

| ID | Question | Recommendation | Decides | Settle by |
|---|---|---|---|---|
| **Q16** | **Old episodes, or only new ones?** → see the plain-language version below | Start with new episodes. Build nothing for the back catalogue unless they ask for it, and tell them the two-week number before they ask. | Stakeholder | **before M1** — one message |
| **Q14** | **Whose library holds the series?** Each friend has their own library, but the episode is recorded together. If two hosts both upload episode 12, there are two libraries and two series. | Default: the library belongs to whoever uploads, and share links cover everyone else. Simplest, no new concepts, and a shared library can be added later if the duplication actually annoys them. But ask — if they expect one shared series for the show, that is a different data model and it is much cheaper to know before M1. | Stakeholder + PM | **before M1** |

### Q16, in plain language — the one question to send

> Do you want to load in the episodes you've already published, or only new ones from now on?
>
> It matters because the free transcription service only does about four episodes a day. If you've got fifty old episodes, that's around a hundred hours of audio and roughly two weeks of the app slowly chewing through them — and the audio files alone would be more storage than the free plan gives us.
>
> Starting with new episodes only is instant and free. Either answer is fine, we just need to know which.

---

## Resolved

Newest first.

| ID | Question | Answer | Source |
|---|---|---|---|
| **Q5** | Which language? | **Brazilian Portuguese.** Not English — that assumption is gone from every document. `language=pt` is pinned on every transcription call, never auto-detected. It is not a setting: the whole text pipeline is built for pt-BR (lemma dictionary, stemmer fallback, stop-word list, accents preserved), which is why it cost `wink-nlp` and a weekend (ADR 0014). Code-switching into English mid-sentence is normal and is handled with watchlist aliases, not a second language (R13). | Stakeholder · ADR 0014 |
| **Q13** | Does the show record **one audio track per host**? | **No — and the question is closed.** *"They would only upload the final edited file."* One file per episode, already edited. So **speaker attribution is cut from the product**, not deferred: energy attribution needed per-host tracks as its input and there is no input (ADR 0015, R24 retired). Two honest consequences to say in-product: counts describe the **published** episode rather than the raw conversation, and any filler-word or pace stat measures the **edit**, not how someone talks. | Stakeholder · ADR 0015 |
| **Q17** | Is a share link public-by-URL, and does it expose the full transcript? | **Unguessable URL, no sign-in, revocable — and it shows counts and the quotes behind them, never the full transcript.** The stakeholder chose this. "Share a result" is what was asked for, and an episode transcript is 18–20k words of conversation nobody consented to publishing in full. Asserted by test at M4. | Stakeholder |
| **Q15** | Keep the episode audio after transcription, or delete it? | **Neither extreme.** Keep audio for recent episodes, auto-purge oldest-first as storage fills, keep transcripts and counts forever. A purged episode keeps every number, quote and timestamp and loses only playback; any episode can be pinned. Preserves the trust-through-playback that D10 depends on without letting the 1 GB tier become a cliff at ~37 episodes. | ADR 0013 |
| **Q1** | Auth from day one? | **Yes — Supabase magic-link sign-in from M1.** Each friend has their own library; `user_id` on every row from the first migration; RLS and a cross-account test that fails closed. M0 gets one shared password for a weekend. | Stakeholder: *"log in, plus share links"* |
| **Q2** | Cloud transcription or local? | **Groq, `whisper-large-v3-turbo`, free tier.** No card, ~160× realtime, word-level timestamps. Nothing runs on the stakeholder's laptop — that was the whole point. Supersedes the local-inference decision. | ADR 0010 |
| **Q3** | File and duration ceilings? | **25 MB per request, which is a size limit, not a duration one.** Episodes run 1 h 40 m – 2 h; 16 kHz mono Opus fits 2 hours in ~21 MB. The browser chunks each episode into ~20–25 min pieces on silence boundaries and the server stitches the timestamps. No product-level duration cap. | Stack + M1 |
| **Q4** | Watchlists or automatic topic discovery? | **Watchlists** — named running jokes with synonym sets. Deterministic, testable, explainable, and the group already knows its bits by name. Auto-*suggestion* only, much later. | ADR 0006 |
| **Q6** | Data retention? | **Audio deleted as soon as transcription succeeds**; transcripts kept until someone deletes the episode; per-episode delete removes the row and the blob. This is a capacity decision now, not a compliance one — see Q15 for the one trade-off it costs. | ADR 0005 + R23 |
| **Q7** | Hosting and budget? | **$0, and no payment method anywhere.** Groq, Vercel Hobby and Supabase free tiers. Every budget, spend alert, cost ceiling and kill switch is deleted from the plan. The real limits are capacity, not cost: 7,200 audio-seconds/hour, 28,800/day, 1 GB storage, 500 MB Postgres. | Stakeholder: *"without having to pay for anything"* |
| **Q8** | Speaker diarisation in v1? | **No — and not in any version.** It does not exist in the free stack, and the one honest workaround (per-host tracks as a loudness signal) has no inputs now that Q13 is answered. **Cut, not deferred.** A mixed-only file gets no speaker breakdown and the UI says why. | ADR 0015 · R24 retired |
| **Q9** | Who is the first real user? | **The group.** The stakeholder and the friends who record the show, with real episodes already on disk. No recruiting, no design-partner conversation, no consent negotiation. | Stakeholder |
| **Q10** | What is the bar for "nice UI"? | **Retired as a gate.** M4 is one hard-timeboxed weekend; unfinished polish gets cut rather than carried. The reference-products-and-checklist exercise was ceremony for a product being sold to strangers. | — |
| **Q11** | Does the assistant answer from aggregates or transcripts? | **Aggregates.** Counting is SQL; the model only phrases the answer. Unchanged, and now a correctness rule rather than a cost one — the assistant itself is an unscheduled *Later* lane. | ADR 0007 |
| **Q12** | Free, paid, or internal? | **Free hobby app for friends.** No billing, ever. One consequence worth remembering: Vercel Hobby is non-commercial, so the day this takes money — donations included — hosting has to be re-chosen first (R25). | Stakeholder |

---

## Out of scope — closed, not parked

Neither of these is a question, a *Later* lane, or a thing with a trigger. Both are here so nobody re-opens them by accident.

| Not doing | Why |
|---|---|
| **A second language / multi-language support** | The pipeline *is* the Portuguese decision — dictionary, stemmer, stop-words, aliases and golden set are all pt-BR. Supporting another language is **a different product decision** with its own conversation, not the next item on a backlog: a second dictionary, a second stop-word list, a second golden set, and a language choice in the UI that every count then has to be qualified by. Code-switched English inside pt-BR speech is a *different thing* and is already handled by aliases (R13). |
| **Who talks most / any speaker dimension** | No per-host tracks, no diarisation in the free stack, and nothing to gate on (Q13, ADR 0015). It would need the group to change how they record **and** to start uploading multi-track exports. |

---

## Blocking

| Blocker | What's needed | Why it can't wait |
|---|---|---|
| **The pt-BR recall pilot — blocks M0** | Ten minutes of one real episode through Groq with `language=pt`, hand-checked for in-joke terms and proper nouns, recall written down (R1) | It is the only thing that can tell us the product does not work for this audio. One evening, free, no code. Everything else in this document assumes it passes |
| **Q14 — whose library · blocks M1** | One answer: per-uploader, or one shared series for the show | It is the data model. Cheap now, a migration and a rewrite of every query later |
| **Q16 — old episodes or only new · blocks M1 planning** | One answer to the plain-language question above | It decides whether the first month is one episode a week or two weeks of drip-feeding against the storage tier (R26) |

Also due before M1 starts, and all free: the chunking and stitching spike on one real two-hour episode, and two back-to-back uploads to see the rate-limit response — see the experiments table in [`risks.md`](./risks.md). One evening and one message, against the risks that could change the plan.
