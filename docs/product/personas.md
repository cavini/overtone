# Overtone — Personas

Four candidates were considered. **The MVP serves P1 (Maya) and only P1.** P2–P4 are deliberately deferred; their needs appear in `use-cases.md` as `Next` / `Later`.

## Ranking (explicit)

| Rank | Persona | Verdict |
|---|---|---|
| **1 — MVP** | **P1 Maya — recurring-meeting owner** | Produces 2–6 recordings/week, so a Library accumulates within days — the precondition for the future *"did we **ever**…"* assistant. Internal, informal use = tolerant accuracy bar. Gets value with zero integrations. Self-serve, no procurement. |
| 2 | P4 Dan — sales team lead | Identical analytics shape, but value is gated on dialer/CRM integration and call-recording consent law. Expensive first customer. |
| 3 | P3 Priya — podcast producer | Loves the numbers, but her real job is shipping publishing assets (chapters, show notes, clips). Different product surface. |
| 4 | P2 Dr. Tomás — qualitative researcher | Highest rigor bar (verbatim fidelity, auditability, reproducible counts). Would force the MVP to over-invest in accuracy guarantees. Best *second* market — he pays for rigor. |

---

## P1 — Maya Okonkwo · Engineering Manager (MVP persona)

| Field | Detail |
|---|---|
| Context | Manages 9 engineers across 2 squads. Runs 4 recurring meetings/week (standup Mon/Thu, sprint review, 1:1 block) on Zoom/Meet; local recordings land in her Downloads folder as `.m4a` / `.mp4` audio. No admin rights to install anything. |
| Job to be done | "Tell me what my team actually spends its airtime on, and whether the thing I flagged three weeks ago is still being talked about." |
| Success measured by | (a) Can name the top 5 recurring themes of the last month without re-listening; (b) spots a topic that is *growing* or *vanishing* across meetings; (c) ≤ 3 min from file-on-disk to a readable answer. |
| Top frustration | Re-listening to a 50-minute recording to confirm one sentence. Meeting notes are written by whoever felt like it and omit exactly what she needs. |
| Accuracy tolerance | High tolerance for ASR errors *if* every number is clickable back to a timestamped quote she can sanity-check. "Roughly right and verifiable" beats "precise and opaque". |
| Deal-breakers | Anything requiring IT approval, a calendar-bot in meetings, or uploading to a vendor that won't let her delete the audio. |
| Vocabulary she uses | "theme", "it keeps coming up", "we dropped that", "how often" — note: *not* "n-gram", "corpus", "lemma". |

## P2 — Dr. Tomás Ferreira · Qualitative researcher (deferred)

| Field | Detail |
|---|---|
| Context | Coding 40 semi-structured interviews, 45–90 min each, 3 languages. Currently NVivo + manual transcription. Publishes; methods section must be defensible. |
| Job to be done | "Count code occurrences across my whole interview set, reproducibly, with the verbatim quote attached to every count." |
| Success measured by | Counts reproducible to the exact number on re-run; exportable to CSV for stats; speaker attribution never wrong; every count traceable to a quote. |
| Top frustration | Tools that silently change their analysis between runs, destroying his published numbers. |
| Why not MVP | Needs guaranteed verbatim fidelity, versioned/pinned analysis, multi-language, and inter-coder workflow. Each is an epic. |

## P3 — Priya Raman · Independent podcast producer (deferred)

| Field | Detail |
|---|---|
| Context | Weekly 60–90 min interview show, 2–3 speakers, edits in Descript. Has sponsors who demand proof of mention. |
| Job to be done | "Prove the sponsor got their 3 mentions, find my clip-worthy moments, and stop saying 'like' so much." |
| Success measured by | Sponsor-mention count she can screenshot into an invoice; filler-word rate trending down; clips located in < 5 min. |
| Top frustration | Scrubbing a waveform hunting for the one good 40 seconds. |
| Why not MVP | Her value is in publishing output (chapters, show notes, clip export), not analytics. |

## P4 — Dan Whitaker · Sales team lead (deferred)

| Field | Detail |
|---|---|
| Context | 6 AEs, ~80 recorded discovery calls/month already sitting in a call-recording tool. |
| Job to be done | "Show me which competitor and which objection is spiking across my team's calls this month." |
| Success measured by | Competitor-mention trend by week; talk/listen ratio per rep; objection taxonomy coverage. |
| Top frustration | Insight arrives after the quarter closed. |
| Why not MVP | Bulk ingest from a third-party system, per-rep permissions, and consent/compliance posture are prerequisites before any value lands. |

---

## Cross-persona invariants (true for all four — treat as product constraints)

1. **Every number must be auditable.** A count with no path to its quotes is worthless to all four personas.
2. **The Library, not the file, is the unit of long-term value.** All four asked a cross-recording question within two sentences of describing their job.
3. **Deletion must be real and user-controlled.** Audio is the most sensitive artifact any of them owns.
4. **Nobody wants a transcript.** A transcript is plumbing; the deliverable is a number plus the quotes behind it.

> ⚠️ NEEDS CONFIRMATION — *Is Maya recording solo audio she owns, or multi-party meetings where other participants' consent is in play?* This changes whether consent/notice UX is an MVP requirement or a `Later` item.
