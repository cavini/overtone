# Overtone — User Journeys

All MVP journeys use **Maya Okonkwo**, engineering manager (see `personas.md`). Journey J5 is a future state including the AI assistant.

**Make-or-break moments are marked 🔥.** These are the steps where the product is won or lost; they get disproportionate design and test attention.

---

## J1 — First run: from a file on disk to a number she believes 🔥

Scenario: Thursday 16:10. Standup ended 10 minutes ago. Maya has `standup-2026-10-08.m4a` (14 min, 11 MB) in Downloads. She has just signed up and has never seen the product.

| Step | User action | System response | What the user feels / needs | Risk |
|---|---|---|---|---|
| 1 | Lands on empty Library | Single primary affordance: a drop zone reading "Drop an audio file — mp3, m4a, wav, aac, ogg, flac, webm · up to 200 MB / 120 min" | "I don't have to learn anything." Needs zero config, zero onboarding tour | A dashboard full of empty widgets reads as broken; she leaves |
| 2 | Drags the file in | Client-side validation passes in < 200 ms; upload begins with a real byte-progress bar | Needs to know it took the file *before* the upload finishes | Silent 30-second gap = she clicks again and double-uploads |
| 3 🔥 | Watches processing | Status `transcribing` with elapsed time and an honest estimate ("about 3 min for a 14-min recording"). Page is leaveable; she is told she can close it | **The dead-time moment.** Needs permission to stop watching | An indeterminate spinner with no ETA is the #1 abandonment point. Never show a spinner without a number |
| 4 | Returns 3 min later | Status `ready`; insight page loads with the top 25 words (stop-words excluded), total word count, duration, and her words-per-minute | Curiosity | Top words are `like, yeah, okay, think` → feels like a toy |
| 5 🔥 | Scans the stats | Above the word cloud sits one sentence of plain-language framing: "Most-discussed in this 14-min recording: **deploy** (23), **flaky** (17), **rollback** (12)" | **The "wow".** She must recognise her own meeting in the output within 5 seconds | If the headline is generic filler words rather than domain nouns, the product looks stupid. Stop-word and filler filtering must be aggressive by default |
| 6 🔥 | Clicks `flaky` (17) | A panel lists all 17 occurrences: timestamp + the surrounding sentence, each clickable to play that moment | **The moment of doubt, resolved.** She needs to verify one before trusting any | If a listed quote doesn't contain the word, trust is gone permanently. This is the single highest-value test in the suite |
| 7 | Plays `08:42` | Audio seeks and plays from 2 s before the match | "It's actually right." | Seek drift > 2 s makes it feel broken even when the count is correct |
| 8 | Prompted: "Track a topic?" | Inline suggestion seeded from her own top terms — one click creates the Topic `flaky tests` with aliases `flaky, flake, flaky test` | Needs the next action handed to her, not a blank form | Asking her to invent a taxonomy from scratch stalls the journey |

**Success looks like:** within 6 minutes of first visit, Maya has verified one count against the audio and created one Topic without reading any documentation.

---

## J2 — The weekly ritual: has it stopped being a problem?

Scenario: Following Thursday. Maya has 5 recordings in the Library and 3 Topics. This is the retention journey — it must take under 90 seconds.

| Step | User action | System response | What the user feels / needs | Risk |
|---|---|---|---|---|
| 1 | Opens Overtone | Library lists recordings newest-first with name, date, duration, status, and her Topic hit counts as inline chips | Needs her answer *on the list page*, before clicking anything | A list of filenames forces a click-hunt; the ritual dies |
| 2 | Uploads today's standup | Accepted; processing starts; she navigates away immediately | Confidence from habit | — |
| 3 🔥 | Opens the Topic `flaky tests` | Mention count per recording across all 6 recordings, chronological: `9 → 17 → 14 → 6 → 2 → 1` | **The payoff of a Library.** This is the first insight no single recording could give | If trend data requires equal-length recordings to be meaningful, raw counts mislead — show mentions-per-hour alongside raw count |
| 4 | Sees the decline | Trend labelled plainly: "down from 17 to 1 over 5 meetings" | Vindication, or an early warning | Over-interpreting noise from a 3-point series; do not render a trend line below 3 recordings |
| 5 | Adds a new Topic `oncall load` | Topic saved; she is offered "Apply to 6 existing recordings" | Expects the past to be re-queryable | If new topics only apply going forward, the Library stops compounding and the "ever" promise is dead |
| 6 | Confirms re-analysis | Re-analysis runs from stored transcripts (no re-transcription), completing in < 10 s for 6 recordings | Needs it to be instant — no transcription cost is involved | Re-running ASR here would be a cost and latency disaster. Transcripts must be stored and re-analysable |

**Success looks like:** Maya answers "is it still a problem?" for a new topic, retroactively across her whole history, in under 90 seconds.

---

## J3 — The bad input: 2 hours of noisy conference audio

Scenario: Maya uploads `allhands-recording.wav` — 118 min, 1.2 GB, recorded on a laptop mic in a reverberant room.

| Step | User action | System response | What the user feels / needs | Risk |
|---|---|---|---|---|
| 1 | Drops a 1.2 GB file | Rejected client-side before any bytes upload: "This file is 1.2 GB. The limit is 200 MB. A 2-hour recording usually fits if you convert it to m4a or mp3." | Needs the *fix*, not the rule | A bare "file too large" sends her to a competitor |
| 2 | Converts to `.m4a` (96 MB) and retries | Accepted; duration 118 min is within the 120-min cap; a notice warns processing may take ~25 min | Needs the long-wait expectation set up front | Setting no expectation makes a correct 25-min job feel like a hang |
| 3 | Closes the laptop | Processing continues server-side; recording is `transcribing` on return | Needs the job to not depend on her tab | Browser-tied processing loses a 25-minute job |
| 4 🔥 | Opens the result | Banner above all statistics: "Audio quality: **poor** (confidence 54/100). Counts on this recording are unreliable — verify before using." Statistics are shown but visually de-emphasised | **The honesty moment.** Needs the product to admit uncertainty before she does | Presenting low-confidence counts with full confidence is the fastest way to lose a user forever |
| 5 | Spot-checks 3 occurrences | 2 of 3 quotes match; 1 is a mis-transcription | Calibrated, not betrayed | — |
| 6 | Deletes the recording | Confirmation dialog names the recording and states "This permanently deletes the audio, transcript, and all statistics." Removed from Library instantly; audio purged within 24 h | Needs deletion to feel final | A soft-delete that she discovers later reads as a betrayal of the dialog's wording |

**Success looks like:** Maya is never surprised — the product refuses, warns, or explains at every step, and she still trusts it enough to upload again tomorrow.

---

## J4 — The failure: processing dies halfway

Scenario: Transcription job crashes on an 18-minute recording (ASR provider 503).

| Step | User action | System response | What the user feels / needs | Risk |
|---|---|---|---|---|
| 1 | Uploads; walks away | Status `transcribing`; worker retries automatically 3× with backoff | Needs nothing — she is gone | — |
| 2 | Returns after 20 min | Status `failed` with a specific cause: "Transcription failed (service unavailable). Your audio is safe. [Retry]" | Needs to know whether *she* broke it or *it* broke | A recording stuck on `transcribing` forever is worse than a visible failure; add a hard timeout at 3× duration that forces `failed` |
| 3 🔥 | Clicks Retry | Job re-queues from the stored audio; status returns to `transcribing` | **The recoverability moment.** Her file must not need re-uploading | Requiring re-upload after a server-side failure is an unforced churn event |
| 4 | Succeeds | Status `ready`; insights appear; the prior failure is not surfaced as history | Relief | — |

**Success looks like:** a server-side failure costs Maya one click and zero re-uploads, and no recording can ever sit in a non-terminal state indefinitely.

---

## J5 — FUTURE STATE: the assistant answers a Library-wide question

Scenario: Maya has 60 recordings over 5 months. She types a question instead of navigating. **Not MVP** — included to constrain the data model today.

| Step | User action | System response | What the user feels / needs | Risk |
|---|---|---|---|---|
| 1 | Types "how many times did we ever discuss hotdogs?" | Question is compiled into a structured Library Query: `term ∈ {hotdog, hot dog, hot-dog}` × `scope = all recordings` × `date = all time` | Needs natural language to be *accepted*, including vague words like "ever" | Free-text that silently becomes a fuzzy semantic search produces unverifiable numbers — the opposite of the product's promise |
| 2 🔥 | Reads the answer | "**7 mentions across 4 recordings**, between 12 May and 29 Sep." Every number is a link | **The grounding moment.** The answer must be the same number the Topic page would show — computed from the same index, not re-derived by the model | If the assistant's number disagrees with the dashboard's number for the same question, the product has no credibility left |
| 3 | Clicks `7 mentions` | Drills to the 7 timestamped quotes across 4 recordings, each playable | Needs the identical drill-down affordance as UC-05 | — |
| 4 | Asks "who brought it up most?" | Follow-up reuses the prior Query as context, adding a speaker group-by | Expects conversational continuity | Stateless Q&A forces her to restate scope every turn |
| 5 | Asks "what did we decide?" | Model summarises the 7 retrieved segments and **cites each claim** with a timestamp link; states plainly when no decision is present | Needs the distinction between a *counted fact* and a *generated summary* to be visible | Blending deterministic counts and model prose in one undifferentiated answer destroys the auditability invariant |

**Success looks like:** the assistant is a new front-end over the same deterministic count index — it never invents a number, always cites, and visibly separates "counted" from "summarised".

### What J5 demands of the MVP data model (build these now, use them later)

| Requirement | Why |
|---|---|
| Token-level index: every word with `recording_id`, `start_ms`, `speaker_id`, `segment_id` | Step 3 drill-down and step 4 group-by are impossible to retrofit cheaply |
| `Query` as a first-class stored object, not a UI parameter bundle | Step 1 compiles NL into the *existing* Query; step 4 extends a stored one |
| Counts computed by one shared engine, exposed to both the UI and the assistant | Step 2's agreement guarantee is architectural, not a prompt instruction |
| Transcripts and segments retained post-processing | Step 5 retrieval and all retroactive re-analysis (J2 step 6) |
| Stable Term identity with alias sets | "hotdog"/"hot dog"/"hot-dog" must resolve to one countable thing in both front-ends |
