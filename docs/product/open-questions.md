# Overtone — Open Questions & Decisions

Decisions that must be made, by whom, and by when. **Recommendation** = the PM's default; if nobody decides by the "settle by" date, we proceed with it and record it as an ADR. Options and trade-offs are in the detail sections below the summary.

Roles: **Stakeholder** = product owner of the business outcome and the budget. **Eng** = the implementing engineer (owns feasibility and the architecture pass). **PM** = sequencing, scope, metrics. Where a decision constrains the tech stack, it's flagged — the architecture pass picks the technology, not this document.

---

## Summary

| ID | Question | Recommendation | Status | Decides | Settle by |
|---|---|---|---|---|---|
| Q1 | Single-user or multi-user/auth from day one? | Real accounts + `user_id` scoping from **M1**; shared secret at M0; no teams/sharing until M6 | open — data-model half settled | Stakeholder + Eng | **pre-M0** (data model), fully M1 |
| Q2 | Cloud transcription API or local model? | **Cloud API** behind a swappable interface; revisit local only if cost >$0.40/audio-hr at >200 hr/mo, or a privacy deal demands it | **resolved — ADR 0004** (buy, Deepgram first, behind a port) | Stakeholder (cost/privacy) + Eng | **pre-M0** |
| Q3 | File size and duration ceilings? | M0: 25 MB / 10 min · MVP: **200 MB / 120 min**; widen later only on evidence, with client-side transcode to 64 kbps mono | settled for MVP — `backlog.md` constants | PM + Eng | **pre-M0** (M0 value), M1 for the rest |
| Q4 | User-defined topic watchlists or automatic topic discovery? | **Watchlists first** (deterministic, testable, explainable); auto-*suggestion* as a seeding aid in M3+; never auto-discovery as the primary surface | **resolved — ADR 0006** | PM + Stakeholder | M2 |
| Q5 | Which languages? | **English only**, stated in-product, with language detection + warning from M4; second language only in M6 behind its own accuracy bar | settled for MVP — English only | Stakeholder | M2 (position), M4 (ship) |
| Q6 | Data retention policy? | Audio deleted **30 days** after successful processing (opt-in to keep); transcripts until user deletes; erasure fulfilled ≤7 days; no vendor training on our data, ever | open | Stakeholder (+ lawyer before public signup) | M1 (default), M4 (controls) |
| Q7 | Hosting and budget expectations? | ≤$75/mo fixed + ≤$100/mo variable for the first 3 months (est.), alerting at 70%; a named number is required before M0 | **open — blocks M0** | Stakeholder | **pre-M0** |
| Q8 | Speaker diarisation in v1? | **Yes, labelled beta**, ≤4 speakers, talk-time share only; hard-gated on ±10 pp accuracy — fails the gate ⇒ ships off | open — gated at M3 | PM + Eng (on evidence) | M3 |
| Q9 | Who is the first real user / design partner? | One named person with ≥5 real recordings and willingness to be interviewed; the engineer alone is not sufficient | **open — blocks M0** | Stakeholder | **pre-M0** |
| Q10 | What is the acceptance bar for "nice UI"? | Two named reference products + a 10-item checklist, agreed before M4 so the timebox is enforceable | open | Stakeholder | M2 |
| Q11 | Does the assistant answer from aggregates, transcripts, or both? | **Aggregates-first** for all counting; capped transcript retrieval for citations only | **resolved — ADR 0007** (tool use, not RAG) | PM + Eng | M2 (schema), M5 (ship) |
| Q12 | Is this free, paid, or internal? Who is it for? | Decide before M4 polish; it changes onboarding, limits and the privacy posture — and whether we need billing at all | open | Stakeholder | M4 |

---

## Detail

### Q1 — Single-user vs multi-user/auth from day one
*Why it matters:* audio is personal data about identifiable third parties. An unauthenticated upload endpoint is simultaneously a privacy incident (R10) and an open tab on our ASR bill (R5). Retrofitting tenancy onto a single-user schema touches every query and every test.

| Option | Trade-off |
|---|---|
| No auth, single user, forever | Fastest; unshippable to anyone else; ~2 weeks of rework later |
| Shared secret at M0, real accounts at M1 | One throwaway day at M0; `user_id` present in the schema from the start | 
| Full auth + teams at M0 | Delays the walking skeleton by ~1 week for value nobody needs yet |

**Recommendation:** middle option. `user_id` exists on every row from the first migration even while there is one user — that column is nearly free now and expensive later. **Stack constraint:** persistence must support user-scoped queries with an isolation test that fails closed.

### Q2 — Cloud transcription API vs local model
*Why it matters:* it sets cost per audio hour, accuracy ceiling, latency, the privacy story, and whether we can ship M0 in a week.

| Option | Trade-off |
|---|---|
| Hosted ASR API | Best accuracy/effort ratio; ~$0.04–0.40/audio-hr (est., tier-dependent); a subprocessor to disclose and a DPA to obtain; a dependency and a price risk |
| Self-hosted open model (Whisper-class) on CPU/GPU | No per-hour vendor fee and no third-party data flow; fixed GPU cost (~$50–300/mo est.) or slow CPU inference (1–3× realtime, wrecking TTFI); ops burden a solo dev cannot carry at M0 |
| Hybrid: cloud default, local for sensitive flagged recordings | Best story, two pipelines to test — premature before real demand |

**Resolved by ADR 0004** — buy transcription, Deepgram Nova-3 as the first real adapter behind a `TranscriptionProvider` port with `Fake` and `LocalWhisper` implementations alongside it. The residual stakeholder question is narrower and still open: *must audio never leave the machine?* A yes supersedes ADR 0004 and ADR 0002 and makes local transcription a day-one requirement, so it must be answered before the M1 vendor commitment.

**Recommendation on the residual:** cloud, confirmed by the **R1 bake-off** (5 real recordings, 2 providers, keyword recall) and gated on the **R10 vendor-terms review** (DPA, zero retention, no training, named region). Price is the third criterion, not the first. Keep it behind one interface with a fixture double (R17) so the decision stays reversible. Revisit local if monthly volume exceeds ~200 audio-hours or a user demands no third-party processing.

### Q3 — File size and duration ceilings
*Why it matters:* ceilings are the primary cost control (R3) and the main upload-failure driver (R8). They also cap the worst-case single invoice.

| Option | Trade-off |
|---|---|
| Generous (4 h / 2 GB) from M0 | One upload can cost >$1.50 and take 30+ min; upload failures dominate early experience |
| Tight and widening per increment | Every increment's ceiling is tested at the limit; users occasionally blocked, with a clear message |
| No ceiling | Unbounded cost and a guaranteed timeout bug |

**Settled for MVP** at 200 MB / 120 min (`backlog.md` constants), with M0 held at 25 MB / 10 min. Widening past that is a later decision, taken on evidence of real demand rather than in advance — and ADR 0008 makes it a pure product choice, since audio bytes never touch the app server. Pair with **client-side transcode to 64 kbps mono** (≈28 MB/audio-hr vs ≈350 MB for WAV), which makes long files practical without raising byte limits. Always show the ceiling *before* the user picks a file, never after the upload. **Stack constraint:** presigned direct-to-storage, resumable multipart.

### Q4 — Watchlists vs automatic topic discovery
*Why it matters:* this is the difference between "a number I asked for" and "a number I have to interpret". It also sets how testable the core is (R2, R16).

| Option | Trade-off |
|---|---|
| User-defined watchlist (term + synonyms) | Deterministic, unit-testable, explainable, matches the stakeholder's literal ask; requires the user to set up a few topics |
| Automatic discovery (topic modelling / LLM labelling) | Zero setup, feels magic; non-deterministic, hard to test, per-recording LLM cost, labels drift between runs so **trends over time become meaningless** |
| Watchlist + "suggested topics" seeded from the transcript | Best of both; suggestions are a one-off cost at M3+, no cross-recording commitment |

**Resolved by ADR 0006** — watchlists are the counting mechanism; automatic discovery arrives later only as a *suggestion* engine proposing watchlists the user accepts, edits or rejects. Drifting labels silently break M3's trend charts, which is a far worse failure than asking a user to type "pricing" once.

### Q5 — Languages supported
*Why it matters:* silent failure is the danger — confident English nonsense from non-English audio produces counts that look fine and are meaningless (R13).

| Option | Trade-off |
|---|---|
| English only, enforced and stated | Honest; narrows the market; cheapest to make accurate |
| Multilingual from the start | Larger market; multiplies the golden-set work per language and the normalisation rules (stemming, compounds) |
| English only but *silently* accept anything | Worst option: garbage counts presented as facts |

**Settled for MVP** at English only (`backlog.md`), **said out loud in-product**, with detection + a visible warning (and optional refusal) from M4. Code-switched audio flagged low-confidence. A second language in M6 only if real demand appears, and only behind its own measured recall bar — adding a language without a golden set for it is just adding unverified numbers.

### Q6 — Data retention policy
*Why it matters:* it determines storage cost (minor), the privacy surface (major), and whether erasure requests are answerable at all (R11). It is also the question a prospective user asks first.

| Option | Trade-off |
|---|---|
| Keep audio forever | Enables re-transcription on model upgrades; largest breach surface; least defensible |
| Delete audio 30 days post-processing, keep transcripts | Re-transcription impossible after 30 days; sharply reduced risk; cheap |
| Delete audio immediately after processing | Strongest posture; a failed/poor transcript can never be re-run — bad while accuracy is still being tuned (R1) |
| User-configurable | Right end state; more UI and more edge cases than M1 can afford |

**Recommendation:** 30-day default with an explicit per-recording "keep audio" opt-in; transcripts retained until the user deletes; account deletion purges both; erasure requests fulfilled within 7 days; no provider permitted to train on our data. Needs a qualified legal review before public signup, alongside Q1's consent attestation (R9). **Stack constraint:** every blob addressable from a DB row; a scheduled purge job from M1.

### Q7 — Hosting and budget expectations
*Why it matters:* M0 cannot start without a paid ASR key, and no cost risk (R3, R4) is manageable against an unstated number.

| Option | Trade-off |
|---|---|
| Hobby tier (~$0–25/mo) | Nearly free; background-job and timeout limits collide directly with 120-min processing (R6) |
| Small managed stack (~$50–100/mo) | Comfortable headroom for queue + DB + storage; the honest baseline |
| Serious infra (>$250/mo) | Unjustifiable before v1 and before paying users |

**Recommendation:** ask the stakeholder for a hard monthly ceiling, and propose ≤$75/mo fixed + ≤$100/mo variable (est.) for the first three months, with alerts at 70% and a kill switch at 100%. **Stack constraint:** whatever is chosen must run background work beyond request timeouts — this disqualifies some otherwise attractive hosting (R6), and it is a product requirement, not an engineering preference.

### Q8 — Diarisation in v1
*Why it matters:* "who spoke how much" is in the stakeholder's brief, but typical DER of 10–20% (est.) rises sharply with crosstalk and a shared room mic. A confidently wrong attribution damages trust in the counts too (R12).

| Option | Trade-off |
|---|---|
| In v1, unlabelled | Meets the brief; a visibly wrong speaker split discredits every other number on the page |
| In v1, labelled beta, talk-time only, ≤4 speakers, renameable | Delivers the brief's intent with honest bounds and manual correction |
| Deferred past v1 | Safest; omits something explicitly asked for |

**Recommendation:** labelled beta, hard-gated on the M3 measurement. Deepgram's diarisation ships with the transcription we are already buying (ADR 0004), so inclusion costs integration and UI work, not a new vendor — which lowers the price of trying it but does **not** lower the accuracy bar (±10 pp vs hand-labelled on 5 files). Fails the gate ⇒ ships off and we say why. No per-speaker *topic* attribution in v1 — it compounds two error rates (diarisation × counting) into a number nobody can audit.

### Q9 — First real user / design partner
*Why it matters:* M0's and M2's exit criteria both require a real user with real recordings. Without one, every accuracy and usefulness judgement is the engineer grading their own homework (R16).

| Option | Trade-off |
|---|---|
| Engineer's own recordings only | Always available; self-confirming; one audio profile, so R18 stays invisible |
| One named external partner | Real audio variety and real feedback; needs recruiting and a consent conversation |
| Several partners at M0 | Better signal; support load a solo dev can't carry this early |

**Recommendation:** exactly one named partner with ≥5 real recordings, recruited **before M0 starts**, plus the engineer's own audio for daily dogfooding. This is the cheapest thing on this list and the most frequently skipped.

### Q10 — The "nice UI" acceptance bar
*Why it matters:* "nice UI" is unbounded and unfalsifiable as stated; without a bar, M4 expands indefinitely and polish leaks into every other increment (R15).

| Option | Trade-off |
|---|---|
| Leave it to taste | Open-ended; relitigated every increment |
| 2 reference products + 10-item checklist + measurable proxies | Bounded and arguable in advance; some genuine quality may be left on the table |
| Hire a designer | Better outcome; cost and coordination not in scope for a solo build |

**Recommendation:** the checklist, agreed by M2 so M4's two-week timebox is enforceable. Proxies that make it measurable: TTFI p50 <2 min, every async state designed, Lighthouse a11y ≥90, WCAG AA contrast on charts, 5/5 unassisted first uploads. **Stack constraint:** pick one component/charting library at M4 and stop evaluating alternatives.

### Q11 — Assistant answers from aggregates, transcripts, or both?
*Why it matters:* it decides M2's storage schema, three increments before the assistant is built — and it is the difference between ~$0.03 and ~$2 per question (R4).

| Option | Trade-off |
|---|---|
| Stuff transcripts into context | Trivial to build; ~$2+ per library-wide question at 50 hours (est.); degrades as the library grows — exactly backwards |
| Aggregates-first, LLM for parsing + narration | Counting is a DB query: cheap, exact, instant, and *auditable*; needs the aggregate schema designed at M2 |
| Vector retrieval over transcript chunks | Good for "what did we say about X"; **bad at counting** — retrieval returns top-k, not all occurrences, so counts are systematically low |

**Resolved by ADR 0007** — the assistant is a tool-using agent over the analytics functions the UI already calls: Claude does language, SQL does arithmetic, and `pgvector` only proposes candidate terms that SQL then counts exactly. `CLAUDE.md` states the rule as *never let an LLM count anything*. Capped transcript retrieval (≤20 segments) exists purely to produce citations. Counting must never depend on retrieval recall. **Stack constraint:** per-recording aggregates stored queryably from M2, transcript segments addressable by timestamp — this is the "cheap to add later" the stakeholder asked for, and it is paid for at M2, not M5.

### Q12 — Free, paid, or internal? Who is the user?
*Why it matters:* unanswered, it quietly decides itself. It changes whether M4 needs billing, how aggressive the quotas are, how much privacy/compliance work is mandatory, and whether retention or revenue is the v1 success test.

| Option | Trade-off |
|---|---|
| Personal/internal tool | No billing, no public ToS, light compliance; no revenue signal and no external validation |
| Free beta with a waitlist | Real feedback and real retention data; we absorb every audio hour of cost (R3, R5) |
| Paid from v1 (e.g. $12–20/mo or per-hour credits, est.) | Strongest validation signal; needs billing, support, and a sharper privacy posture before launch |

**Recommendation:** free beta, capped at ~10 invited users through M5, with quotas tight enough that the worst case stays inside the Q7 budget. Decide paid-vs-free before M6 picks its lane, since billing would itself be a lane. **Blocking for M4:** if it is ever to be paid, the consent/retention work (Q6, R9) must be done properly rather than retrofitted.

---

## Blocking the first increment (M0)

Architecture has closed Q2, Q4 and Q11 (ADRs 0004, 0006, 0007) and the backlog has fixed Q3 and Q5, so only two questions genuinely block M0, and both are the stakeholder's:

| Blocker | What is needed | Why it cannot wait |
|---|---|---|
| **Q7 — budget** | One hard monthly ceiling | M0 needs a paid Deepgram key, and no cost risk (R3, R5) is manageable against an unstated number |
| **Q9 — design partner** | One named person with ≥5 real recordings | It is an M0 exit criterion, and without it every accuracy judgement is the engineer grading their own homework (R16) |

Needed in the same window, but not blocking the first commit: **Q2's residual** (must audio never leave the machine? — answer before the M1 vendor commitment, since a yes supersedes ADR 0004), the **R10 vendor-terms review** (DPA, zero retention, no training — gates M1), and **Q1's data-model half** (`user_id` in the first migration, which is a one-line decision the engineer can take now).

Everything else can be decided while M0 is being built. The pre-M0 work is roughly one afternoon of experiments (R1/R2/R16/R18 on the same 5 recordings, ~4 hours, <$5) plus two conversations.
