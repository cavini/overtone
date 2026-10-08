# Overtone — Open Questions & Decisions

Most of this document used to be about money, vendors and lawyers. The stakeholder has settled the product — *a free hobby app for a podcast a group records together, friends sign in with a magic link, any single result shareable by link* — and the free stack (Groq + Vercel Hobby + Supabase) settled the rest. Those questions are closed below, with their answers, because the answers are now constraints.

**Recommendation** = the PM's default. If nobody decides by the "settle by" date, we proceed with it. Five questions are genuinely still open and four of them are one message to the group.

---

## Still open

| ID | Question | Recommendation | Decides | Settle by |
|---|---|---|---|---|
| **Q13** | Does the show already record **one audio track per host**? | If yes, "who talks most" becomes possible later — transcribe the mixed file once and attribute each word to whichever host's track is loudest at that timestamp. If no, it never ships and we say so plainly. Nothing is built either way until M3 is done. | Stakeholder | **before M1** — one message |
| **Q14** | **Whose library holds the series?** Each friend has their own library, but the episode is recorded together. If two hosts both upload episode 12, there are two libraries and two series. | Default: the library belongs to whoever uploads, and share links cover everyone else. Simplest, no new concepts, and a shared library can be added later if the duplication actually annoys them. But ask — if they expect one shared series for the show, that is a different data model and it is much cheaper to know before M1. | Stakeholder + PM | **before M1** |
| **Q15** | Keep the episode audio after transcription, or delete it? | **Resolved — ADR 0013.** Neither extreme: keep audio for recent episodes, auto-purge oldest-first as storage fills, keep transcripts and counts forever. A purged episode keeps every number, quote and timestamp and loses only playback; any episode can be pinned. Preserves the trust-through-playback that D10 depends on without letting the 1 GB tier become a cliff at ~37 episodes. | ~~Stakeholder~~ resolved | — |
| **Q16** | Does the **back catalogue** go in? | Say the number first: 50 episodes × 2 h is 100 audio-hours, which at four episodes a day is about **two weeks** of drip-feeding on the free tier (R26). Recommendation: start the series with new episodes, backfill opportunistically, build nothing for it unless they ask. | Stakeholder | M3 |
| **Q17** | Is a share link public-by-URL, and is a full transcript fine to expose through one? | Unguessable URL, no sign-in, revocable, and it shows **only** the shared result. Default to sharing the counts and the quotes rather than the whole transcript — an episode transcript is 18–20k words of unedited conversation, and "share a result" is what was asked for. Confirm before M4. | Stakeholder | M4 |

---

## Resolved

| ID | Question | Answer | Source |
|---|---|---|---|
| **Q1** | Auth from day one? | **Yes — Supabase magic-link sign-in from M1.** Each friend has their own library; `user_id` on every row from the first migration; RLS and a cross-account test that fails closed. M0 gets one shared password for a weekend. | Stakeholder: *"log in, plus share links"* |
| **Q2** | Cloud transcription or local? | **Groq, `whisper-large-v3-turbo`, free tier.** No card, ~160× realtime, word-level timestamps. Nothing runs on the stakeholder's laptop — that was the whole point. Supersedes the local-inference decision. | ADR 0010 |
| **Q3** | File and duration ceilings? | **25 MB per request, which is a size limit, not a duration one.** Episodes run 1 h 40 m – 2 h; 16 kHz mono Opus fits 2 hours in ~21 MB. The browser chunks each episode into ~20–25 min pieces on silence boundaries and the server stitches the timestamps. No product-level duration cap. | Stack + M1 |
| **Q4** | Watchlists or automatic topic discovery? | **Watchlists** — named running jokes with synonym sets. Deterministic, testable, explainable, and the group already knows its bits by name. Auto-*suggestion* only, much later. | ADR 0006 |
| **Q5** | Which languages? | **English only**, said out loud in-product, with a warning when detection disagrees. One show, one language. | — |
| **Q6** | Data retention? | **Audio deleted as soon as transcription succeeds**; transcripts kept until someone deletes the episode; per-episode delete removes the row and the blob. This is a capacity decision now, not a compliance one — see Q15 for the one trade-off it costs. | ADR 0005 + R23 |
| **Q7** | Hosting and budget? | **$0, and no payment method anywhere.** Groq, Vercel Hobby and Supabase free tiers. Every budget, spend alert, cost ceiling and kill switch is deleted from the plan. The real limits are capacity, not cost: 7,200 audio-seconds/hour, 28,800/day, 1 GB storage, 500 MB Postgres. | Stakeholder: *"without having to pay for anything"* |
| **Q8** | Speaker diarisation in v1? | **No — it does not exist in the free stack.** Not deferred for accuracy reasons; unavailable. The only honest route is per-host tracks used as a loudness signal (Q13), which is unscheduled. Transcribing each track separately is wrong twice: mics pick up each other, so counts double, and three 2-hour tracks is 6 audio-hours against a 2-hour hourly allowance. | R24 |
| **Q9** | Who is the first real user? | **The group.** The stakeholder and the friends who record the show, with real episodes already on disk. No recruiting, no design-partner conversation, no consent negotiation. | Stakeholder |
| **Q10** | What is the bar for "nice UI"? | **Retired as a gate.** M4 is one hard-timeboxed weekend; unfinished polish gets cut rather than carried. The reference-products-and-checklist exercise was ceremony for a product being sold to strangers. | — |
| **Q11** | Does the assistant answer from aggregates or transcripts? | **Aggregates.** Counting is SQL; the model only phrases the answer. Unchanged, and now a correctness rule rather than a cost one — the assistant itself is an unscheduled *Later* lane. | ADR 0007 |
| **Q12** | Free, paid, or internal? | **Free hobby app for friends.** No billing, ever. One consequence worth remembering: Vercel Hobby is non-commercial, so the day this takes money — donations included — hosting has to be re-chosen first (R25). | Stakeholder |

---

## Blocking M1

Nothing blocks M0; it needs a free Groq key and an afternoon.

| Blocker | What's needed | Why it can't wait |
|---|---|---|
| **Q14 — whose library** | One answer: per-uploader, or one shared series for the show | It is the data model. Cheap now, a migration and a rewrite of every query later |
| **Q13 — per-host tracks** | Yes or no | Not needed to build M1, but a "no" lets us stop discussing speaker breakdown entirely, and a "yes" is worth knowing before the audio pipeline is designed |

Also due before M1 starts, and all free: the chunking and stitching spike on one real two-hour episode, two back-to-back uploads to see the rate-limit response, and the back-catalogue arithmetic from Q16 — see the experiments table in [`risks.md`](./risks.md). One evening and two messages, against the four risks that could change the plan.
