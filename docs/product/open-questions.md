# Overtone — Open Questions & Decisions

Most of this document used to be about money, vendors and lawyers. The stakeholder has settled the product — *a free hobby app for a podcast a group records together **in Brazilian Portuguese**, friends sign in with a magic link, any single result shareable by link* — and the free stack (Groq + Vercel Hobby + Supabase) settled the rest. Those questions are closed below, with their answers, because the answers are now constraints.

**Two closed this round, and they moved scope in opposite directions.** **The interface must be bilingual** — pt-BR and English, switchable (Q18: `next-intl`, two catalogues, **+2 weekends**, two new risks, ADR 0017). **Only new episodes, never the archive** (Q16: the back-catalogue import lane is **deleted**, taking one *Later* lane and one risk row with it — but **zero weekends back**, because it was never scheduled). The addition is on the critical path and the reduction was not, so they do not cancel out.

**Recommendation** = the PM's default. If nobody decides by the "settle by" date, we proceed with it. **One question is genuinely still open**, and it is a single message to the stakeholder.

---

## Still open

| ID | Question | Recommendation | Decides | Settle by |
|---|---|---|---|---|
| **Q14** | **Whose library holds the series?** The show is recorded by a group, but each friend signs in to their own account. | **No longer blocking — ADR 0012.** The schema carries a `series_members` table from the first migration and every read is scoped by *membership*, not ownership. A new series gets exactly one member, so it behaves identically to per-uploader today, while "invite a co-host" stays a row insert instead of a migration touching every query and RLS policy. The remaining question is purely a product one — *do you want one shared series for the show?* — and it can be answered at M3 or never. | Stakeholder, whenever | not blocking |

---

## Resolved

Newest first.

| ID | Question | Answer | Source |
|---|---|---|---|
| **Q18** | One interface language, or two? | **Two — Brazilian Portuguese and English, switchable.** `next-intl` carries it: locale routing, Server Component support, two catalogues (`messages/pt.json`, `messages/en.json`). The library is the small half. The large half is the rule that **no user-facing text exists below the presenter** — errors, warnings and empty states are **typed message codes with parameters**, so an episode row stores `failure_code` + `failure_params jsonb` rather than a sentence, and an unhandled code is a compile error (ADR 0017). The mechanism lands in **M0**, not because M0 has copy but because M0 is where the first strings get written and retrofitting means hunting hundreds of them later. Cost: **+2 weekends** (M0 1→2 for the mechanism, M4 1→2 for the copy) and two new risks — **R30** locale number formatting, **R31** a count must never move because the interface language did. | Stakeholder · ADR 0017 |
| **Q16** | Old episodes, or only new ones? | **Only new ones — there is nothing to import.** The back-catalogue import lane is **deleted** from the roadmap rather than parked in *Later*: no import story, nothing to schedule, no trigger to wait for. R26 retires outright and R23 drops 4 → 2 for want of an import burst. **It gives back no weekends**, because the lane was never estimated. One consequence has to be said plainly: the series **starts empty and grows one episode at a time**, so the cross-episode value this product is built around does not exist until episode 2 and is not worth arguing about until episode 3 or 4 (**R32**). Until then all the value is per-episode — which is M2's, not M3's — and the North Star reads near zero for the first month by arithmetic, not by failure. | Stakeholder |
| **Q5** | Which language is the **audio**? | **Brazilian Portuguese.** Not English — that assumption is gone from every document. `language=pt` is pinned on every transcription call, never auto-detected. It is not a setting, **and Q18 does not make it one** — the interface has two languages, the audio has one, and nothing in the counting path may read the interface's (R31). The whole text pipeline is built for pt-BR (lemma dictionary, stemmer fallback, stop-word list, accents preserved), which is why it cost `wink-nlp` and a weekend (ADR 0014). Code-switching into English mid-sentence is normal and is handled with watchlist aliases, not a second language (R13). | Stakeholder · ADR 0014 |
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

None of these is a question, a *Later* lane, or a thing with a trigger. They are here so nobody re-opens them by accident.

| Not doing | Why |
|---|---|
| **A second *audio* language — analysing a show recorded in anything but pt-BR** | The pipeline *is* the Portuguese decision: dictionary, stemmer, stop-words, aliases and golden set are all pt-BR. Analysing another language is **a different product decision** with its own conversation — a second dictionary, a second stop-word list, a second golden set, and every count then qualified by which language produced it. **Not to be confused with Q18:** the *interface* is bilingual from M0, the *audio* is pt-BR forever, and the two are deliberately unconnected (R31). Code-switched English inside pt-BR speech is a third thing again, handled by aliases (R13). |
| **Back-catalogue import** | **Q16: only new episodes.** No import story, so no lane, no trigger and no estimate. The arithmetic that used to justify one — 100 audio-hours, two weeks of drip-feeding, past the 1 GB tier — is moot rather than daunting (R26 retired). To come back it would need the group to ask for old episodes **and** bring an answer for storage. |
| **Who talks most / any speaker dimension** | No per-host tracks, no diarisation in the free stack, and nothing to gate on (Q13, ADR 0015). It would need the group to change how they record **and** to start uploading multi-track exports. |

---

## Blocking

| Blocker | What's needed | Why it can't wait |
|---|---|---|
| **The pt-BR recall pilot — blocks M0** | Ten minutes of one real episode through Groq with `language=pt`, hand-checked for in-joke terms and proper nouns, recall written down (R1) | It is the only thing that can tell us the product does not work for this audio. One evening, free, no code. Everything else in this document assumes it passes |

Also due before M1 starts, and all free: the chunking and stitching spike on one real two-hour episode, two back-to-back uploads to see the rate-limit response, and **one message asking when the next two episodes are recorded** — the dates that decide whether M3 ships before there is anything to compare (R32). See the experiments table in [`risks.md`](./risks.md). One evening and one message, against the risks that could change the plan.
