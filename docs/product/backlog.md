# Overtone — Product Backlog

**Reading order is delivery order.** E1 is the walking skeleton: the thinnest end-to-end path (upload one small file → see one real statistic). Nothing is made rich until that path is proven in production.

**Priority** = MoSCoW (`Must` / `Should` / `Could` / `Won't-yet`, scoped to the first release).
**Size** = S (≤ 1 day) / M (1–3 days) / L (> 3 days — must be split before it is Ready).
Domain nouns are defined in `glossary-and-domain.md`; statuses are exactly `uploaded`, `transcribing`, `analyzing`, `ready`, `failed`, `deleting`.

### Fixed constants referenced by acceptance criteria

| Constant | MVP value |
|---|---|
| Accepted extensions | `.mp3`, `.m4a`, `.wav`, `.aac`, `.ogg`, `.flac`, `.webm` |
| Max file size | 200 MB |
| Max duration | 120 minutes |
| Default top-N words | 25 |
| Quality warning threshold | mean ASR confidence < 70 / 100 |
| Processing hard timeout | 3 × recording duration → forces `failed` |
| Topic limits | ≤ 50 Topics per Library, ≤ 20 Terms per Topic, ≤ 5 words per Term |
| MVP language | English (`en`) only |

### Walking-skeleton sequence (build in exactly this order)

`US-001` → `US-002` → `US-003` → `US-004` → `US-005`. After US-005 the product is shippable to one real user and the whole pipeline is proven. Every later story is an increment on a working system, never a prerequisite for one.

---

## E1 — Walking skeleton: audio in, one real number out
**Outcome:** a signed-in user uploads one small audio file and sees one genuine, verifiable statistic derived from its actual contents.

### US-001 — Upload one small audio file
*As Maya, I want to upload an audio file from my computer, so that the system has something to analyse.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Accept a supported file within limits
  Given I am signed in with an empty Library
  And I have a 90-second 2 MB file named "standup.m4a"
  When I select the file and confirm the upload
  Then a Recording is created in my Library with status "uploaded"
  And the Recording title defaults to "standup"
  And the Recording duration reads 90 seconds within 1 second
  And the Recording appears in my Library without a page reload

Scenario: Upload progress is observable
  Given I am uploading a 50 MB file
  When the upload is in flight
  Then a progress indicator reports bytes transferred as a percentage
  And the percentage is monotonically non-decreasing

Scenario: Interrupted upload creates no Recording
  Given I am uploading a 50 MB file
  When the connection drops at 40 percent
  Then no Recording appears in my Library
  And I see the error "Upload interrupted. Nothing was saved — please try again."
```

### US-002 — Observe a Recording's processing state
*As Maya, I want to see where my recording is in the pipeline, so that I know whether to wait or come back later.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Status advances through the pipeline
  Given a Recording with status "uploaded"
  When transcription starts
  Then the Recording status is "transcribing"
  When transcription completes and analysis starts
  Then the Recording status is "analyzing"
  When analysis completes
  Then the Recording status is "ready"

Scenario: Waiting state shows an estimate, never a bare spinner
  Given a Recording of 14 minutes with status "transcribing"
  When I view the Recording
  Then I see elapsed processing time in seconds
  And I see an estimated remaining time derived from the recording duration
  And I see the text "You can close this page — processing continues."

Scenario: Status updates without manual refresh
  Given I am viewing a Recording with status "transcribing"
  When the status changes to "ready" on the server
  Then the displayed status becomes "ready" within 5 seconds
  And I did not reload the page
```

### US-003 — Produce and store a Transcript
*As Maya, I want my audio turned into text the system keeps, so that statistics can be computed now and re-computed later without paying for transcription again.*
Priority: **Must** · Size: **L** → split into: provider integration · Segment persistence · failure handling (US-008)

```gherkin
Scenario: Transcript is persisted with timestamped Segments
  Given a Recording with status "uploaded" containing clear speech
  When transcription completes
  Then exactly one Transcript is stored for the Recording
  And the Transcript records the ASR model identifier and a produced-at timestamp
  And the Transcript has at least one Segment
  And every Segment has start_ms, end_ms, text, and a confidence between 0 and 1
  And Segment start_ms values are strictly increasing
  And no Segment end_ms exceeds the Recording duration in milliseconds

Scenario: Transcript survives re-analysis
  Given a Recording with status "ready"
  When analysis is re-run for that Recording
  Then no new transcription request is made to the ASR provider
  And the stored Transcript id is unchanged

Scenario: Known-audio fixture transcribes correctly enough to count
  Given the fixture recording "fixture-deploy-60s.m4a" whose script says "deploy" 5 times
  When transcription completes
  Then the Transcript contains the token "deploy" at least 4 times
```

### US-004 — Compute word-frequency counts
*As Maya, I want the system to count the words in my recording, so that there is a real statistic to look at.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Tokens are indexed with full provenance
  Given a Recording with a stored Transcript
  When analysis completes
  Then every Token is stored with recording_id, segment_id, position, start_ms, surface, normalized and lemma
  And punctuation characters produce no Tokens

Scenario: Counts are case- and punctuation-insensitive
  Given a Transcript containing "Deploy, deploy. DEPLOY!"
  When analysis completes
  Then the count for the term "deploy" is 3

Scenario: Intra-word apostrophes and hyphens are preserved
  Given a Transcript containing "don't end-to-end don't"
  When analysis completes
  Then the count for the term "don't" is 2
  And the count for the term "end-to-end" is 1

Scenario: Analysis records its configuration for reproducibility
  Given a Recording with status "ready"
  When I inspect its Analysis
  Then the Analysis records the normalization version and the stop-word list version
  And re-running analysis with the same configuration yields identical counts
```

### US-005 — See the top words for one Recording
*As Maya, I want to see the words that dominated my recording, so that I learn something I did not already know within five seconds of the page loading.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Top words are shown, ranked, with stop words excluded
  Given a Recording with status "ready"
  When I open the Recording
  Then I see at most 25 terms ordered by count descending
  And no term in the list appears on the active stop-word list
  And each row shows the term and its integer count
  And I see the total word count and the recording duration

Scenario: Headline sentence names the top three terms
  Given a Recording whose top three non-stop-word terms are "deploy" 23, "flaky" 17, "rollback" 12
  When I open the Recording
  Then the page shows a headline naming "deploy", "flaky" and "rollback" with the counts 23, 17 and 12

Scenario: A recording with no speech is reported honestly
  Given a 30-second Recording containing only silence
  When analysis completes
  Then the Recording status is "ready"
  And I see the message "No speech detected in this recording."
  And no top-words list is rendered
```

---

## E2 — Ingestion that fails well
**Outcome:** every bad input and every server-side failure produces a specific, actionable state — no silent limbo, no lost uploads.

### US-006 — Reject unsupported formats
*As any user, I want an immediate, specific rejection of files Overtone cannot process, so that I do not waste an upload.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Unsupported extension is rejected before upload begins
  Given I am signed in
  When I select the file "notes.docx"
  Then no bytes are uploaded
  And no Recording is created
  And I see the error "Unsupported file type .docx. Overtone accepts .mp3, .m4a, .wav, .aac, .ogg, .flac and .webm."

Scenario: File with an audio extension but non-audio content is rejected after upload
  Given I upload a text file renamed to "fake.mp3"
  When the server validates the content
  Then the Recording is set to status "failed"
  And the failure reason reads "This file is not readable as audio."

Scenario: Every accepted extension is in fact accepted
  Given I am signed in
  When I upload a valid 10-second file for each of mp3, m4a, wav, aac, ogg, flac and webm
  Then 7 Recordings are created with status "uploaded"
```

### US-007 — Enforce size and duration caps with a workaround
*As any user, I want to be told the limit and how to get around it, so that a rejection is a next step rather than a dead end.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Oversized file is rejected client-side
  Given I select a 1.2 GB file
  Then no bytes are uploaded
  And I see the error "This file is 1.2 GB. The limit is 200 MB. Converting a long recording to m4a or mp3 usually fits."

Scenario: Over-long file is rejected after duration is read
  Given I upload a valid 185-minute 80 MB mp3
  When the server reads its duration
  Then no analysis is started
  And the Recording is set to status "failed"
  And the failure reason reads "This recording is 185 minutes. The limit is 120 minutes."

Scenario: File exactly at the limits is accepted
  Given I upload a 200 MB file of exactly 120 minutes
  Then a Recording is created with status "uploaded"
```

### US-008 — Recover from a processing failure without re-uploading
*As any user, I want a failed recording to be retryable in one click, so that a server-side problem does not cost me my file.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Transient provider error is retried automatically
  Given a Recording with status "transcribing"
  When the ASR provider returns HTTP 503
  Then the job is retried up to 3 times with increasing backoff
  And the Recording status remains "transcribing" during retries

Scenario: Exhausted retries produce a terminal failed state with a cause
  Given a Recording whose transcription has failed 3 times
  Then the Recording status is "failed"
  And the failure reason names the cause "Transcription failed (service unavailable)"
  And I see the text "Your audio is safe." and a Retry action

Scenario: Retry reuses the stored audio
  Given a Recording with status "failed"
  When I choose Retry
  Then the Recording status becomes "transcribing"
  And I was not asked to upload the file again

Scenario: No recording can stall indefinitely
  Given a Recording of 10 minutes with status "transcribing"
  When 30 minutes of processing time elapse
  Then the Recording status is "failed"
  And the failure reason names a timeout
```

### US-009 — Detect a duplicate upload
*As any user, I want Overtone to notice I already uploaded this file, so that I do not pay twice or double-count my statistics.*
Priority: **Should** · Size: **S**

```gherkin
Scenario: Identical content is not processed twice
  Given my Library contains a Recording with content hash "abc123" and status "ready"
  When I upload a file whose content hash is "abc123"
  Then no new transcription is started
  And I see the message "You already uploaded this recording on <date>." with a link to it

Scenario: Same filename but different content is processed normally
  Given my Library contains a Recording named "standup.m4a"
  When I upload a different 90-second file also named "standup.m4a"
  Then a second Recording is created with status "uploaded"
```

---

## E3 — Trust: making every number verifiable
**Outcome:** the user can get from any statistic to the audio that produced it in two clicks, and is warned when the audio is too poor to trust.

### US-010 — Read the Transcript with timestamps
*As Maya, I want to read what was said with times attached, so that I can find exact wording without re-listening.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Transcript renders in order with timestamps
  Given a Recording with status "ready" and 40 Segments
  When I open its transcript
  Then all 40 Segments are rendered in ascending start time
  And each Segment shows its start time formatted as mm:ss
  And the last Segment's start time is not greater than the recording duration

Scenario: Transcript is searchable within the page
  Given a transcript containing the word "rollback" in 3 Segments
  When I search the transcript for "rollback"
  Then 3 matches are reported
  And the first match is scrolled into view
```

### US-011 — Drill from a count to its occurrences and play them
*As Maya, I want to click a count and see every place it occurred, so that I can verify the number is real before I act on it.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Every occurrence of a term is enumerated
  Given a Recording whose count for "flaky" is 17
  When I select the term "flaky"
  Then exactly 17 occurrences are listed
  And each occurrence shows a timestamp and the surrounding Segment text
  And every listed Segment text contains a token matching the term "flaky"

Scenario: Playback seeks to the occurrence
  Given an occurrence of "flaky" at 08:42
  When I select that occurrence
  Then audio playback begins between 08:40 and 08:42

Scenario: A zero count offers no drill-down
  Given a Recording whose count for "hotdog" is 0
  When I view that term
  Then the count renders as 0
  And no occurrence list is offered

Scenario: Playback is unavailable when audio has been purged
  Given a Recording whose audio has been purged
  When I select an occurrence
  Then the quote and timestamp are shown
  And I see the message "Audio for this recording has been deleted."
```

### US-012 — Warn when audio quality makes counts unreliable
*As Maya, I want to be told when the recording was too poor to trust, so that I never present a number that is wrong.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Poor-quality recording is flagged above the statistics
  Given a Transcript whose mean Segment confidence is 0.54
  When I open the Recording
  Then a quality score of 54 out of 100 is displayed
  And a warning reads "Audio quality: poor. Counts on this recording are unreliable — verify before using."
  And the warning appears above the statistics

Scenario: Good-quality recording shows no warning
  Given a Transcript whose mean Segment confidence is 0.91
  When I open the Recording
  Then no quality warning is displayed
  And the quality score 91 is available on request

Scenario: Threshold boundary
  Given a Transcript whose mean Segment confidence is 0.70
  Then no quality warning is displayed
  Given a Transcript whose mean Segment confidence is 0.699
  Then the quality warning is displayed
```

### US-013 — Handle non-English audio honestly
*As any user, I want Overtone to refuse clearly rather than produce nonsense, so that I never get a silently wrong analysis.*
Priority: **Should** · Size: **M**

```gherkin
Scenario: Non-English audio is detected and refused
  Given I upload a 60-second recording of Brazilian Portuguese speech
  When language detection runs
  Then the Recording status is "failed"
  And the failure reason reads "Overtone currently analyses English only. Detected language: Portuguese."
  And no word counts are produced

Scenario: English audio proceeds
  Given I upload a 60-second English recording
  When language detection runs
  Then the Recording language is "en"
  And processing continues to "analyzing"

Scenario: Detected language is recorded even when uncertain
  Given a recording whose language detection confidence is below 0.6
  Then the Recording records language "unknown"
  And processing continues with the warning "Language could not be confirmed; results may be unreliable."
```

### US-014 — Separate speakers and report their share
*As Maya, I want counts broken down by speaker, so that I can see who is driving which subject.*
Priority: **Should** · Size: **L** → split: diarization integration · per-speaker counts · speaker rename

```gherkin
Scenario: Speakers are detected and labelled
  Given a Recording with two distinct voices
  When diarization completes
  Then 2 Speakers exist for the Recording, labelled "Speaker 1" and "Speaker 2"
  And every Segment is attributed to exactly one Speaker
  And Utterances do not span more than one Speaker

Scenario: Talk-time share sums to the recording
  Given a Recording with 2 Speakers
  Then each Speaker's talk time is reported in seconds and as a percentage
  And the percentages sum to 100 within 1 percentage point

Scenario: Per-speaker term counts partition the total
  Given a Recording whose total count for "deploy" is 10
  Then the sum of per-speaker counts for "deploy" equals 10

Scenario: Renaming a speaker updates every surface
  Given a Speaker labelled "Speaker 2"
  When I rename it to "Priya"
  Then the transcript, talk-time chart and per-speaker counts all show "Priya"
  And other Recordings' Speaker labels are unchanged

Scenario: Single-voice recording needs no speaker UI
  Given a Recording with one detected Speaker
  Then no speaker breakdown is rendered
```

---

## E4 — Analytics worth reading
**Outcome:** the statistics reflect what the user means by "a word", not what a tokeniser means.

### US-015 — Control stop-word filtering
*As Maya, I want filler and function words out of my way by default, so that the top of the list is the actual subject matter.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Stop words are excluded from the default view
  Given a Transcript where "the" occurs 210 times and "deploy" 23 times
  When I open the Recording
  Then "the" does not appear in the top-words list
  And "deploy" appears in the top-words list

Scenario: Stop words are stored, not discarded
  Given the same Recording
  When I turn off stop-word filtering
  Then "the" appears with the count 210

Scenario: An explicitly tracked stop word is always counted
  Given a Topic "capacity" containing the Term "can"
  And a Transcript where "can" occurs 14 times
  Then the Topic "capacity" reports 14 mentions
  And this is true with stop-word filtering on
```

### US-016 — Group inflections, with an exact-words escape hatch
*As Maya, I want "run", "running" and "ran" counted as one thing by default, so that counts match how I think.*
Priority: **Should** · Size: **M**

```gherkin
Scenario: Lemma grouping is the default
  Given a Transcript containing "run" 6 times, "running" 5 times and "ran" 3 times
  When I open the Recording
  Then a single row reads "run" with the count 14

Scenario: Variants are inspectable
  Given the row "run" with the count 14
  When I expand it
  Then I see "run 6", "running 5" and "ran 3"

Scenario: Exact-words mode disables grouping
  Given the same Recording
  When I switch to exact words
  Then three separate rows read "run" 6, "running" 5 and "ran" 3

Scenario: Contractions are not expanded in word counts
  Given a Transcript containing "don't" 4 times and "do not" 1 time
  When I view exact words
  Then "don't" reads 4 and "do not" is not merged into it
```

### US-017 — Count phrases, not just single words
*As Maya, I want multi-word phrases counted, so that "flaky test" is a thing and not two things.*
Priority: **Should** · Size: **M**

```gherkin
Scenario: Top phrases are reported
  Given a Transcript containing "flaky test" 9 times
  When I open the phrase statistics
  Then "flaky test" appears with the count 9

Scenario: Spelling and separator variants collapse
  Given a Transcript containing "hot dog" twice, "hotdog" three times and "hot-dog" once
  When the Term "hotdog" is counted
  Then the count is 6

Scenario: Plural phrase variants are included via lemma
  Given a Transcript containing "hotdogs" once and "hot dog" once
  When the Term "hotdog" is counted
  Then the count is 2

Scenario: A phrase never matches across a speaker turn
  Given Speaker 1 ends an utterance with "hot"
  And Speaker 2 begins the next utterance with "dog"
  When the Term "hot dog" is counted
  Then the count is 0
```

### US-018 — Report filler-word and pace metrics
*As Maya, I want to see verbal tics and speaking pace, so that there is a metric about delivery and not only subject matter.*
Priority: **Could** · Size: **S**

```gherkin
Scenario: Filler words are counted separately from the word index
  Given a Transcript containing "um" 31 times and "like" 44 times
  When I open the Recording
  Then a filler-words metric reports "um" 31 and "like" 44
  And neither term appears in the top-words list
  And a filler rate per minute is shown
```

---

## E5 — Topics: the user's own metrics
**Outcome:** the user defines what they care about once, and every recording — past and future — is measured against it.

### US-019 — Create a Topic from Terms
*As Maya, I want to define a Topic with the words I'd actually use for it, so that the count tracks the concept and not one spelling.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: A Topic is created with alias Terms
  Given I am signed in
  When I create the Topic "flaky tests" with the Terms "flaky", "flake" and "flaky test"
  Then the Topic exists in my Library with 3 Terms
  And it applies to all current and future Recordings

Scenario: Duplicate Topic names are rejected
  Given a Topic named "flaky tests" exists
  When I create another Topic named "Flaky Tests"
  Then it is rejected with the message "A topic named 'flaky tests' already exists."

Scenario: An empty Topic is rejected
  When I create a Topic with no Terms
  Then it is rejected with the message "Add at least one term to this topic."

Scenario: Limits are enforced with specific messages
  Given my Library has 50 Topics
  When I create another Topic
  Then it is rejected with the message "You have reached the limit of 50 topics."
  When I add a 21st Term to a Topic
  Then it is rejected with the message "A topic can have at most 20 terms."
  When I add the Term "a somewhat excessively long phrase here"
  Then it is rejected with the message "A term can be at most 5 words."
```

### US-020 — See Topic mentions for one Recording
*As Maya, I want each recording to report my Topics' mention counts, so that I can answer "was this discussed?" immediately.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Topic counts appear on the Recording
  Given the Topic "flaky tests" with Terms "flaky", "flake" and "flaky test"
  And a Transcript containing "flaky" 12 times, "flake" 3 times and "flaky test" 2 times
  When I open the Recording
  Then the Topic "flaky tests" reports 17 mentions

Scenario: Overlapping Terms are not double-counted
  Given the Topic "flaky tests" contains both "flaky" and "flaky test"
  And a Transcript containing the phrase "flaky test" exactly once and no other occurrence of "flaky"
  Then the Topic reports 1 mention

Scenario: An unmentioned Topic is shown as zero, not hidden
  Given the Topic "hiring" and a Transcript with none of its Terms
  When I open the Recording
  Then the Topic "hiring" reports 0 mentions

Scenario: Topic counts drill down to quotes
  Given the Topic "flaky tests" reports 17 mentions
  When I select the Topic
  Then 17 timestamped occurrences are listed
```

### US-021 — Suggest Topics from the recording itself
*As Maya, I want Overtone to propose what I might track, so that I am not facing a blank form on my first visit.*
Priority: **Should** · Size: **S**

```gherkin
Scenario: Suggestions come from the recording's own top terms
  Given a Recording with status "ready" and no Topics in my Library
  When I open the Recording
  Then I am offered at least 3 and at most 8 suggested Topics
  And every suggestion is derived from a term in this Recording's top 25
  And no suggestion is a stop word

Scenario: Accepting a suggestion creates a real Topic
  When I accept the suggestion "flaky"
  Then a Topic "flaky" is created containing at least the Term "flaky"
  And it is counted on this Recording immediately

Scenario: Suggestions exclude Topics I already track
  Given I already track the Topic "deploy"
  Then "deploy" is not offered as a suggestion
```

### US-022 — See a Topic's mentions across the whole Library over time
*As Maya, I want one Topic's counts across all my recordings in date order, so that I can see whether something is growing or going away.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Per-recording counts in chronological order
  Given 6 ready Recordings dated over 6 weeks
  And the Topic "flaky tests" with counts 9, 17, 14, 6, 2, 1 in that date order
  When I open the Topic
  Then the 6 counts are listed in ascending date order
  And a total of 49 mentions across 6 recordings is reported

Scenario: Normalised rate is shown alongside raw counts
  Given a 10-minute Recording with 10 mentions and a 60-minute Recording with 12 mentions
  When I open the Topic
  Then mentions per hour are reported as 60 and 12 respectively

Scenario: No trend line below three data points
  Given 2 ready Recordings
  When I open the Topic
  Then per-recording counts are listed
  And no trend direction is claimed

Scenario: Recordings still processing are excluded, not counted as zero
  Given 5 ready Recordings and 1 Recording with status "transcribing"
  When I open the Topic
  Then 5 Recordings are included
  And I see the note "1 recording is still processing."
```

---

## E6 — The Library as an asset
**Outcome:** recordings accumulate into a browsable collection whose value grows, and whose contents the user fully controls.

### US-023 — Browse and filter the Library
*As Maya, I want my recordings listed with their headline numbers, so that I get my answer before clicking anything.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Library lists recordings newest first with status and Topic chips
  Given 6 Recordings uploaded on different dates and 2 Topics
  When I open my Library
  Then 6 rows are listed in descending upload date order
  And each row shows title, upload date, duration and status
  And each ready row shows a mention count chip for each of my 2 Topics

Scenario: Filter by date range and status
  Given 6 Recordings, 2 of them with status "failed"
  When I filter by status "ready"
  Then 4 rows are listed
  When I additionally filter to the last 7 days
  Then only Recordings uploaded within 7 days are listed

Scenario: Pagination at scale
  Given 120 Recordings
  When I open my Library
  Then at most 50 rows are rendered in the first page
  And the total count 120 is displayed
```

### US-024 — Rename a Recording
*As Maya, I want to retitle a recording, so that "zoom_0042.m4a" becomes "Sprint review Oct 8".*
Priority: **Should** · Size: **S**

```gherkin
Scenario: Title is editable and the source filename is preserved
  Given a Recording titled "zoom_0042"
  When I rename it to "Sprint review Oct 8"
  Then the Library row reads "Sprint review Oct 8"
  And the original filename "zoom_0042.m4a" is still recorded
  And an empty title is rejected with the message "Give this recording a title."
```

### US-025 — Delete a Recording permanently
*As any user, I want deletion to be real and final, so that I trust Overtone with sensitive audio.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Confirmation states exactly what is destroyed
  Given a ready Recording titled "Sprint review Oct 8"
  When I choose Delete
  Then the confirmation names "Sprint review Oct 8"
  And it states "This permanently deletes the audio, transcript and all statistics."

Scenario: Deletion removes the Recording and all derived data
  Given I confirm deletion
  Then the Recording disappears from my Library immediately
  And its Transcript, Segments, Tokens and Analyses are no longer retrievable by any request
  And its audio object is purged from storage within 24 hours
  And requesting the Recording by its previous id returns not-found

Scenario: Deletion updates Library-wide Topic counts
  Given the Topic "flaky tests" reported 49 mentions across 6 Recordings
  And one of those Recordings contributed 17 mentions
  When I delete that Recording
  Then the Topic reports 32 mentions across 5 Recordings

Scenario: Cancelling changes nothing
  When I open the delete confirmation and cancel
  Then the Recording is still in my Library with status "ready"
```

### US-026 — Re-run analysis retroactively
*As Maya, I want a new Topic applied to recordings I already uploaded, so that my history becomes answerable.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: A new Topic is applied to existing Recordings on request
  Given 6 ready Recordings
  When I create the Topic "oncall load" and choose to apply it to existing Recordings
  Then all 6 Recordings report a mention count for "oncall load"
  And no transcription request is made to the ASR provider
  And the operation completes within 10 seconds for 6 Recordings

Scenario: Re-analysis replaces results without destroying the Transcript
  Given a Recording with one Analysis
  When analysis is re-run
  Then a new Analysis exists recording the new configuration version
  And the Transcript id is unchanged

Scenario: Re-analysis is skipped for recordings without a Transcript
  Given a Recording with status "failed"
  When I apply a new Topic to existing Recordings
  Then that Recording is reported as skipped with the reason "no transcript"
```

---

## E7 — Presentation that makes the number land
**Outcome:** the insight is comprehensible in five seconds by someone who has never seen the product.

### US-027 — Recording insight page
*As Maya, I want one page that tells me what this recording was about, so that I do not have to assemble the story from widgets.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Page presents a fixed, ordered hierarchy
  Given a ready Recording
  When I open it
  Then the page renders in this order: quality warning if any, headline sentence, Topic mention counts, top words, link to transcript
  And the headline sentence and top three terms are visible without scrolling at 1280 by 800

Scenario: Every count is an interactive drill-down affordance
  Given the insight page
  Then every rendered count is actionable and opens its occurrence list

Scenario: Processing recording shows progress, not a broken page
  Given a Recording with status "transcribing"
  When I open it
  Then the progress state from US-002 is shown
  And no empty statistics sections are rendered
```

### US-028 — First-run and empty states
*As a new user, I want one obvious thing to do, so that I reach my first statistic without instructions.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Empty Library shows a single primary action
  Given a signed-in user with 0 Recordings
  When I open my Library
  Then exactly one primary action is offered, to add a recording
  And the accepted formats and the 200 MB and 120 minute limits are stated
  And no empty charts or placeholder widgets are rendered

Scenario: No Topics yet
  Given a ready Recording and 0 Topics
  Then the Topics area invites me to track a suggestion from US-021
  And it does not render an empty chart
```

### US-029 — Accessibility and responsive baseline
*As any user, I want the app usable on my laptop and with a keyboard, so that it is not a desktop-mouse-only tool.*
Priority: **Should** · Size: **S**

```gherkin
Scenario: Keyboard and contrast baseline
  Given any primary page
  Then every interactive element is reachable by keyboard in a logical order
  And every interactive element has an accessible name
  And text contrast meets WCAG AA at 4.5 to 1
  And an automated accessibility scan reports 0 critical violations

Scenario: Narrow viewport
  Given a viewport 390 pixels wide
  When I open a ready Recording
  Then no horizontal page scrolling is required
  And the headline sentence and Topic counts remain readable
```

---

## E8 — Getting the data out
**Outcome:** Overtone is not a walled garden; numbers and text leave in standard formats.

### US-030 — Export statistics as CSV
*As Maya, I want the counts as a CSV, so that I can put them in a deck or a spreadsheet.*
Priority: **Should** · Size: **S**

```gherkin
Scenario: Per-recording statistics export
  Given a ready Recording with 25 top terms and 3 Topics
  When I export statistics as CSV
  Then the file has a header row "term,count,type,recording_id,recording_title,recording_date"
  And it contains 25 rows of type "term" and 3 rows of type "topic"
  And the counts equal those displayed on screen

Scenario: Library-wide Topic export
  Given 6 ready Recordings and 2 Topics
  When I export the Topic trend as CSV
  Then the file contains 12 rows, one per Topic per Recording
```

### US-031 — Export the Transcript
*As Maya, I want the transcript as text or subtitles, so that I can quote it or caption a clip.*
Priority: **Could** · Size: **S**

```gherkin
Scenario: Plain text and SRT exports
  Given a ready Recording with 40 Segments and 2 Speakers
  When I export as TXT
  Then the file contains all 40 Segment texts in order with mm:ss timestamps and speaker labels
  When I export as SRT
  Then the file contains 40 well-formed cues numbered 1 to 40 with non-overlapping times
```

---

## E9 — Accounts, privacy and data control
**Outcome:** a user's audio is theirs — isolated, deletable, and never visible to anyone else.

### US-032 — Sign in and see only my own Library
*As any user, I want my recordings private to me, so that I can upload real meetings.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Authentication is required for all data
  Given I am not signed in
  When I request the Library, a Recording, a Transcript or an export
  Then each request is refused as unauthenticated
  And no recording data is returned

Scenario: Tenancy isolation
  Given user A owns a Recording and user B is signed in
  When user B requests that Recording by id
  Then the response is not-found
  And no transcript, token or count data for user A is returned

Scenario: Topics are scoped to one Library
  Given user A has the Topic "flaky tests"
  When user B lists Topics
  Then "flaky tests" is not listed
```

### US-033 — Delete my account and all my data
*As any user, I want a single action that erases everything, so that leaving is as easy as joining.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Account deletion is explicit and complete
  Given I own 6 Recordings, 3 Topics and 2 saved Queries
  When I request account deletion and confirm by typing my email address
  Then my session is ended
  And no Recording, Transcript, Segment, Token, Analysis, Topic or Query of mine is retrievable
  And all my audio objects are purged from storage within 72 hours
  And I receive a confirmation that deletion has completed

Scenario: Deletion requires matching confirmation
  When I type an email address that does not match my account
  Then deletion is refused with the message "That does not match your account email."
  And my data is unchanged
```

### US-034 — Purge source audio but keep the analysis
*As a privacy-conscious user, I want to delete the audio and keep the numbers, so that I can analyse material I would not store.*
Priority: **Could** · Size: **S**

```gherkin
Scenario: Audio purge preserves counts and disables playback
  Given a ready Recording with audio retained
  When I purge its audio
  Then the Recording status remains "ready"
  And its counts and quotes are still available
  And the audio object is removed from storage within 24 hours
  And playback reports "Audio for this recording has been deleted."
  And re-transcription is refused with the reason "source audio deleted"
```

---

## E10 — Query foundation (makes the assistant cheap later)
**Outcome:** every count the product shows is produced by one shared, structured Query engine — so a natural-language front-end becomes a translation layer, not a second analytics stack.

### US-035 — Structured Library Query
*As Maya, I want to ask one structured question across my whole Library, so that "ever" questions are answerable today without a chatbot.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: A Query counts across the whole Library with provenance
  Given 6 ready Recordings and the Term "hotdog"
  When I run a Query for that Term over all time
  Then a total mention count is returned
  And the number of matching Recordings is returned
  And the earliest and latest match dates are returned
  And every match carries recording_id, start_ms and the Segment text

Scenario: The Query engine and the Recording page agree
  Given a Recording whose page reports the Topic "flaky tests" as 17 mentions
  When I run a Query for that Topic scoped to that Recording
  Then the result is 17

Scenario: Date and speaker scoping
  Given matches in May and September
  When I run a Query restricted to September
  Then only September matches are returned
  When I additionally group by speaker
  Then per-speaker counts are returned and sum to the ungrouped total

Scenario: A Query with no matches returns an explicit zero
  When I run a Query for a Term that never occurs
  Then the total is 0 and the matching recordings count is 0
  And no error is raised
```

### US-036 — Save and re-run a Query
*As Maya, I want to keep a question I ask often, so that the answer is one click away each week.*
Priority: **Could** · Size: **S**

```gherkin
Scenario: A saved Query is re-runnable and reflects new data
  Given I save a Query for the Topic "flaky tests" over all time
  When a new ready Recording with 4 mentions is added
  And I re-run the saved Query
  Then the total has increased by 4
  And the saved Query definition is unchanged
```

---

## Out of scope for now

| Deliberately not building | Reason |
|---|---|
| **AI chatbot / natural-language assistant** | The headline future capability, but it multiplies cost and failure modes (hallucinated numbers, prompt-injection from transcript content, eval harness, latency) on top of a pipeline that is not yet proven. It must be a *front-end over existing counts*, and that is only safe once US-035 exists and is trusted. See the data-model prerequisites below. |
| Machine-discovered / clustered topics | Unstable across recordings, unexplainable to a distrustful user, and untestable with fixed expected values. User-defined Topics plus seeded suggestions (US-021) capture most of the value. See `glossary-and-domain.md` D7. |
| Fuzzy / phonetic matching of mishearings | Trades invisible false negatives for invisible false positives with no eval set. Needs a measured precision/recall baseline first (D9). |
| Sentiment, emotion, intent and summarisation | Unfalsifiable outputs. Every MVP claim must be a count a test can assert. |
| Recordings over 120 minutes | Requires chunked processing, partial results and a different cost model. Revisit when a real user is blocked. |
| Non-English analysis | Needs per-language stop-word lists, lemmatisers and tokenisation rules — one epic per language. MVP refuses clearly instead (US-013). |
| Live / real-time transcription, bots joining calls | A different product with calendar integrations, consent flows and streaming infrastructure. |
| Video files | Audio extraction plus a player is real work for zero additional insight. |
| Teams, shared Libraries, roles, per-recording permissions | MVP Library is single-owner. Sharing introduces an authorisation model that would slow every story. |
| Public share links | Needs anonymous-access security review and redaction thinking. |
| CRM / dialer / bulk archive import | Belongs to deferred personas (Dan, Tomás), not the MVP persona. |
| Cross-recording speaker identity (voiceprints) | Biometric data with consent and accuracy implications. Speakers stay scoped to one Recording. |
| PII detection and redaction | Needed for regulated buyers, not for Maya's internal standups. |
| Billing, plans, quotas | No paid tier until the Library premise is validated. |
| Mobile apps | Responsive web (US-029) is sufficient for the upload-from-laptop journey. |

### What must be true in the data model so the chatbot is cheap to add

1. **Token-level index with full provenance** — every Token carries `recording_id`, `segment_id`, `utterance_id`, `speaker_id`, `start_ms`, `surface`, `normalized`, `lemma`. Delivered by US-004. Without it, drill-down and group-by cannot be retrofitted.
2. **`Query` is a stored, first-class object** — not UI filter state. Delivered by US-035/US-036. The assistant's only new job becomes natural language → Query.
3. **One count engine, two front-ends** — the assistant must never compute a number itself. Enforced by the US-035 "engine and page agree" scenario, which becomes the regression test that keeps the chatbot honest.
4. **Transcripts and Segments retained after processing** — required for retrieval-grounded answers and for retroactive re-analysis. Delivered by US-003/US-026.
5. **Stable Term identity with alias sets** — `hotdog` / `hot dog` / `hot-dog` / `hotdogs` must resolve to one countable thing for both front-ends. Delivered by US-017.
6. **Per-Library tenancy on every read path** — the assistant inherits isolation for free only if US-032 enforced it at the data layer rather than in the UI.
7. **Segment table shaped for later embedding** — stable Segment ids with text and timestamps, so a vector index can be added as a sidecar without reshaping the transcript.

> ⚠️ NEEDS CONFIRMATION — *Is a single-owner Library acceptable for the MVP, or does Maya need to share insights with her manager on day one?* Recommendation: **single-owner**; US-030 CSV export covers the sharing need without an authorisation model.
