# Overtone — Use Case Catalogue

**Primary actor abbreviations:** `Maya` = recurring-meeting owner (MVP persona), `Any` = any signed-in user, `Sys` = system/background worker, `Tomás`/`Priya`/`Dan` = deferred personas (see `personas.md`).

**Release column:** `MVP` = required for first shippable release · `Next` = immediately after MVP, same shape of value · `Later` = post-validation or deferred persona.

| ID | Use case | Primary actor | Trigger | Value delivered | Release |
|---|---|---|---|---|---|
| UC-01 | Upload a single audio file | Maya | Meeting just ended; file is on disk | Audio enters the Library and processing starts without further action | **MVP** |
| UC-02 | See word-frequency statistics for one recording | Maya | Processing completes | Answers "what dominated this meeting?" in one glance | **MVP** |
| UC-03 | Watch the progress of a processing recording | Maya | Upload accepted | Removes the dead-time anxiety; tells her whether to wait or leave | **MVP** |
| UC-04 | Read the transcript with timestamps | Maya | Doubts a number, or wants the exact wording | Converts a count into evidence she trusts | **MVP** |
| UC-05 | Drill from a count to every timestamped occurrence | Maya | Clicks a word/topic in the stats | Makes every statistic auditable; kills "is this even right?" | **MVP** |
| UC-06 | Define a Topic watchlist of terms she cares about | Maya | Has a recurring concern ("flaky tests", "hiring") | Turns generic word counts into *her* metrics | **MVP** |
| UC-07 | See Topic mention counts for one recording | Maya | Opens a recording she has topics for | Direct answer to "was this discussed?" | **MVP** |
| UC-08 | Browse and filter the Library | Maya | Returns after a few days | Finds the right recording; sees the collection as an asset | **MVP** |
| UC-09 | Delete a recording and its derived data | Any | Recording was private/mistaken/obsolete | Control over sensitive audio; trust to upload more | **MVP** |
| UC-10 | Recover from an unsupported file format | Any | Drops a `.docx`, `.pdf`, or DRM'd file | Fast, specific correction instead of a dead end | **MVP** |
| UC-11 | Recover from a file that exceeds size/duration caps | Any | Uploads a 4-hour all-hands | Knows the limit and the workaround before wasting an upload | **MVP** |
| UC-12 | Recover from a processing failure | Any / Sys | ASR or analysis job errors out | Recording lands in a clear `failed` state with a retry, not a silent limbo | **MVP** |
| UC-13 | Be warned when audio quality is too poor to trust | Maya | Recorded on a laptop mic in a noisy room | Prevents acting on garbage numbers; preserves trust in the product | **MVP** |
| UC-14 | Sign in and see only my own data | Any | Returns to the app | Baseline tenancy guarantee; precondition for uploading anything real | **MVP** |
| UC-15 | Export statistics as CSV | Maya / Tomás | Needs the numbers in a deck or a stats tool | Overtone stops being a walled garden | **Next** |
| UC-16 | Export the transcript (TXT / SRT) | Maya / Priya | Wants to paste quotes into notes or subtitle a clip | Reuse of the asset she paid processing for | **Next** |
| UC-17 | See a Topic's mention trend across the whole Library | Maya | Monthly retro / "is this still a thing?" | The first genuinely cross-recording insight; validates the Library premise | **Next** |
| UC-18 | Distinguish speakers and see per-speaker counts | Maya / Dan | Multi-party meeting | "Who said it" and talk-time share; unlocks coaching use cases | **Next** |
| UC-19 | Handle non-English or mixed-language audio | Any | Uploads Portuguese or code-switched audio | Either correct analysis or an honest, specific refusal | **Next** |
| UC-20 | Re-run analysis after changing Topics or stop-words | Maya | Adds a topic she wishes she'd tracked | Old recordings gain new answers; Library compounds in value | **Next** |
| UC-21 | Detect and skip a duplicate upload | Any | Uploads the same file twice | No duplicate processing cost, no double-counted statistics | **Next** |
| UC-22 | Process a very long recording (2–6 h) | Any | Quarterly all-hands, conference day | Chunked processing with partial results instead of refusal | **Later** |
| UC-23 | Delete my account and all associated data | Any | Churn, or a privacy request | Legal/ethical obligation; also a trust *sales* argument | **Next** |
| UC-24 | Configure retention — purge source audio after processing | Any | Sensitive recording she wants analysed but not stored | Lets her upload material she'd otherwise never upload | **Later** |
| UC-25 | Share a read-only insight page with a colleague | Maya | Wants to show her skip-level the airtime data | Viral distribution loop; no seat required for the viewer | **Later** |
| UC-26 | Ask the AI assistant a natural-language question across the Library | Maya | *"How many times did they ever discuss hotdogs?"* | The headline future capability; needs UC-17 + UC-05 data model to exist | **Later** |
| UC-27 | Compare two recordings side by side | Maya | This week's standup vs. last week's | Change detection without manual diffing | **Later** |
| UC-28 | Bulk-import an existing archive of recordings | Dan / Tomás | Onboarding with 80 historical files | Day-one Library depth for the deferred personas | **Later** |

---

## Notes on scope boundaries

- **UC-01 → UC-02 is the walking skeleton.** Everything else is enrichment of a path that must work end-to-end first.
- **UC-05 is non-negotiable in MVP** even though it looks like polish. Without drill-down, every count is an unfalsifiable claim and the product fails the cross-persona invariant "every number must be auditable."
- **UC-26 is the north star, not the MVP.** It is cheap to add *only if* UC-05 and UC-17 are built on a token-level, timestamped, per-Library index. See `glossary-and-domain.md` D11 and `backlog.md` → Out of scope.
- **UC-13 protects the trust budget.** A product that confidently reports counts from an unintelligible recording loses the user permanently.

> ⚠️ NEEDS CONFIRMATION — *Should UC-19 (non-English) reject with a clear message, or attempt best-effort transcription with a warning?* Recommendation: detect language, and for MVP **reject with a specific message naming the supported language**, because a silently-wrong Portuguese word count is worse than a refusal.

> ⚠️ NEEDS CONFIRMATION — *Is UC-18 (speaker separation) required for Maya to get value, or is whole-recording counting enough for v1?* Recommendation: **not required for MVP** — her questions are "was this discussed / how often", not "who said it". Diarization doubles ASR cost and complexity.
