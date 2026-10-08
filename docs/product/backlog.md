# Overtone — Product Backlog

**Reading order is delivery order.** E1 is the walking skeleton: sign in, upload one short file, see one real number. E2 comes immediately after, because **a real episode is two hours long** and the skeleton only handles a two-minute one.

**Priority** = MoSCoW, scoped to the first release. **Size** = S (≤ 1 day) / M (1–3 days) / L (> 3 days — split before it is Ready).

**Only first-release stories carry Gherkin here.** The rest are named, sized and argued for in one line each; their acceptance criteria are written when they are pulled. Pre-writing a hundred scenarios for stories nobody has started is the waterfall this project exists to avoid.

Domain nouns are in `glossary-and-domain.md`. Statuses are exactly `uploaded`, `transcribing`, `analyzing`, `ready`, `failed`, `deleting`.

### Fixed constants referenced by acceptance criteria

| Constant | Value | Why it is this number |
|---|---|---|
| **Typical episode** | **100–120 minutes** | What the show actually records. Two hours is the normal case, not an edge case |
| **Supported episode length** | **up to 150 minutes** | Past that the daily allowance, not the code, is the wall |
| Upload chunk length | **20–25 minutes**, cut on a silence boundary | Fits the service cap with margin, transcribes in parallel, isolates failure to one chunk |
| Chunk codec | **16 kHz mono Opus** (~24 kbps) | A 25-minute chunk is ≈ 4.5 MB; a 2-hour episode ≈ 22 MB total |
| Max size per chunk | 25 MB (hard service cap) | With Opus this stops being the binding limit — it stays in the AC to prove it |
| **Transcription allowance** | **2 audio-hours per hour · 8 per day, shared across every user** | ≈ **one 2-hour episode per hour, four per day.** Fine weekly; a 50-episode backfill takes ~2 weeks |
| Request limits | 20/min · 2 000/day (shared) | Free tier |
| Per-chunk processing ceiling | **120 s** → `failed` | The platform hard-kills a request at 300 s; fail honestly first |
| Total file storage | **1 GB** ≈ 37 two-hour episodes | Binds sooner than the allowance on a backfill |
| Total database | 500 MB | Free tier |
| Accepted extensions | `.mp3`, `.m4a`, `.wav`, `.aac`, `.ogg`, `.flac`, `.webm` | What the browser can decode |
| Language | English only | The one language the pipeline is built and tested for |
| Default top-N words | 25 | |
| Quality warning threshold | mean confidence < 70 / 100 | |
| Topic limits | ≤ 50 Topics/Library · ≤ 20 Terms/Topic · ≤ 5 words/Term | |
| Host tracks per Episode | ≤ 6, used for **attribution only, never transcribed** | A group of friends, not a conference panel |
| Share links | one per Episode, unguessable, revocable | |

### Walking-skeleton sequence (build in exactly this order)

`US-032` → `US-001` → `US-002` → `US-003` → `US-004` → `US-005` → `US-040`

Sign-in is first because tenancy retrofits badly and because "my friends can use it" is the premise, not a later feature. US-040 is seventh and not optional: after US-005 the pipeline works on a short file, after US-040 it works on a real episode.

**Then the first increment that is actually the product:** `US-019` → `US-020` → `US-038` → `US-022` → `US-042` → `US-039`. A running joke, counted per episode, across a Series, ranked, and shareable.

---

## E1 — Walking skeleton: audio in, one real number out

### US-032 — Sign in with a magic link and see only my own Library
*As Rafa, I want to sign in without a password, so that my friends and I can each have our own library with no setup.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: A magic link signs me in
  Given I am not signed in
  When I submit my email address and follow the emailed link
  Then I am signed in to my own Library
  And I was never asked to choose a password

Scenario: Nobody can read anybody else's data
  Given user A owns an Episode and a Topic
  When user B requests them by id
  Then the response is not-found and no transcript, token or count data is returned
  When I request a Library, an Episode or a Topic while signed out
  Then the request is refused as unauthenticated
```

### US-001 — Upload one episode's audio
*As Rafa, I want to upload audio, so that there is something to analyse.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Accept a supported file
  Given I am signed in with an empty Library
  And I have a 2-minute file named "ep12.m4a"
  When I confirm the upload
  Then an Episode is created with status "uploaded" and the title "ep12"
  And its duration reads 120 seconds within 1 second
  And it appears in my Library without a page reload

Scenario: Interrupted upload creates no Episode
  When the connection drops at 40 percent
  Then no Episode appears in my Library
  And I see "Upload interrupted. Nothing was saved — please try again."
```

### US-002 — Watch processing, and resume a half-finished episode
*As Rafa, I want to see progress and not lose work if I close the tab, so that a two-hour episode is not an all-or-nothing gamble.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Waiting shows numbers, never a bare spinner
  Given a 2-hour Episode of 6 chunks with status "uploaded"
  When transcription starts, then completes, then analysis completes
  Then the status reads "transcribing", then "analyzing", then "ready"
  And while transcribing I see "4 of 6 chunks transcribed" and the elapsed time in seconds
  And I see an estimate derived from the remaining audio duration

Scenario: Closing the tab keeps finished chunks
  Given an Episode whose chunks 1 to 4 of 6 have transcribed
  When I close the tab and return
  Then the Episode reads "4 of 6 chunks transcribed" and offers Resume
  When I choose Resume
  Then only chunks 5 and 6 are sent for transcription
  And chunks 1 to 4 are not transcribed again
```

### US-003 — Store the Transcript with word-level timestamps
*As Rafa, I want the text kept, so that stats can be recomputed later without spending the transcription allowance again.*
Priority: **Must** · Size: **L** → split: provider adapter · chunk stitching (US-040) · failure handling (US-008)

```gherkin
Scenario: Transcript is persisted with timestamped Segments
  Given an Episode containing clear speech
  When transcription completes
  Then exactly one Transcript is stored, recording the model id and a produced-at timestamp
  And every Segment has start_ms, end_ms, text and a confidence between 0 and 1
  And Segment start_ms values are strictly increasing across the whole Episode
  And no Segment end_ms exceeds the Episode duration in milliseconds
  And the raw provider payload for every chunk is stored verbatim

Scenario: The transcript is good enough to count, and survives re-analysis
  Given the fixture "fixture-hotdog-60s.m4a" whose script says "hotdog" 5 times
  Then the Transcript contains the token "hotdog" at least 4 times
  When analysis is re-run for that Episode
  Then no transcription request is made and the Transcript id is unchanged
```

### US-004 — Count words with full provenance
*As Rafa, I want the words counted, so that there is a real statistic and every one of them can be traced back.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Tokens are indexed with full provenance
  Given an Episode with a stored Transcript
  When analysis completes
  Then every Token stores episode_id, chunk_id, segment_id, speaker_id, position, start_ms, surface, normalized and lemma
  And start_ms is relative to the start of the Episode, not of its chunk
  And punctuation characters produce no Tokens

Scenario: Counts are case- and punctuation-insensitive
  Given a Transcript containing "Hotdog, hotdog. HOTDOG!"
  Then the count for the term "hotdog" is 3

Scenario: Intra-word apostrophes and hyphens are preserved
  Given a Transcript containing "don't end-to-end don't"
  Then the count for "don't" is 2 and the count for "end-to-end" is 1

Scenario: Analysis records its configuration for reproducibility
  Given an Episode with status "ready"
  Then its Analysis records the normalization, stop-word list and pipeline versions
  And re-running analysis with the same configuration yields identical counts
```

### US-005 — See the top words for one episode
*As Rafa, I want the words that dominated the episode, so that I learn something in five seconds.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Top words are ranked, with stop words excluded
  Given an Episode whose top three terms are "hotdog" 61, "anyway" 44 and "basically" 31
  Then at most 25 terms are listed by count descending
  And no listed term appears on the active stop-word list
  And the page headline names those three terms with those three counts
  And I see the total word count, the duration and words per minute

Scenario: An episode with no speech is reported honestly
  Given a 30-second Episode containing only silence
  Then its status is "ready" and I see "No speech detected in this recording."
  And no top-words list is rendered
```

---

## E2 — Real episodes: two hours, chunked

**This epic is the main flow, not a fallback.** The show records 100–120 minutes. Everything here runs on every upload.

### US-040 — Upload a two-hour episode as silence-cut chunks
*As Rafa, I want a two-hour episode to just work, so that I never have to open an audio editor to use a fun app.*
Priority: **Must** · Size: **L** → split: decode and compress · silence-boundary splitting · parallel transcription and stitching

```gherkin
Scenario: A two-hour episode is chunked, compressed and uploaded
  Given a 120-minute 160 MB wav file
  When I confirm the upload
  Then the browser splits it into 5 or 6 chunks of 20 to 25 minutes
  And each chunk is encoded as 16 kHz mono Opus and is at most 25 MB
  And the original file is never uploaded
  And progress is reported per chunk

Scenario: Splitting never cuts a word in half
  Given a file whose 25-minute mark falls in the middle of the word "hotdog"
  When the file is split
  Then the cut is moved to the nearest silence of at least 300 milliseconds
  And the cut is within 90 seconds of the nominal chunk length
  And the fixture's full word sequence is recoverable from the chunks with no word lost and none duplicated

Scenario: A two-hour episode produces one set of counts matching its script
  Given the fixture "fixture-2h-script.wav" whose script says "hotdog" 184 times across 6 chunks
  When all chunks are transcribed and stitched
  Then one Episode exists with one Transcript
  And its duration reads 120 minutes within 2 seconds
  And the count for "hotdog" is at least 175
  And no Token appears twice

Scenario: A timestamp after a chunk join resolves to the same moment in the audio
  Given chunk 2 begins at 24:30 of the Episode
  And an occurrence of "hotdog" 90 seconds into chunk 2
  Then the occurrence displays 26:00
  And selecting it begins playback between 25:58 and 26:00

Scenario: One chunk failing does not lose the others
  Given a 6-chunk Episode where chunk 4 fails 3 times
  Then chunks 1, 2, 3, 5 and 6 remain transcribed
  And the Episode status is "failed" with the reason naming chunk 4
  And Retry re-sends only chunk 4, spending no allowance on the five that succeeded
```

### US-007 — Refuse bad input with the fix attached
*As any user, I want to be told the limit and the remedy together, so that a rejection is a next step instead of a dead end.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Unsupported and unreadable files are rejected before anything is spent
  When I select "notes.docx"
  Then no bytes are uploaded, no Episode is created, and I see "Unsupported file type .docx. Overtone accepts .mp3, .m4a, .wav, .aac, .ogg, .flac and .webm."
  When I select a text file renamed "fake.mp3"
  Then the browser fails to decode it and I see "This file is not readable as audio."
  And no transcription request is made

Scenario: Every accepted extension is in fact accepted
  When I upload a valid 10-second file for each of mp3, m4a, wav, aac, ogg, flac and webm
  Then 7 Episodes are created with status "uploaded"

Scenario: An episode beyond the supported length is refused with numbers
  When I select a 200-minute file
  Then I see "This is 200 minutes. Overtone supports episodes up to 150 minutes, and today's allowance covers about 4 hours of audio. Split it into two episodes."
```

### US-008 — Recover from a failure without re-uploading
*As any user, I want one click to retry, so that a service problem does not cost me my evening.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Transient errors are retried, then fail terminally with a cause
  Given a chunk being transcribed
  When the service returns HTTP 503 three times
  Then the request was retried with increasing backoff
  And the Episode status is "failed" with the reason "Transcription failed (service unavailable)"
  And I see "Your audio is safe." and a Retry action
  When I choose Retry
  Then the status becomes "transcribing" and I was not asked to upload or re-compress anything

Scenario: Nothing stalls indefinitely
  Given a chunk that has been transcribing for 120 seconds
  Then the Episode status is "failed" and the reason names a timeout
  And no Episode remains in a non-terminal state
```

---

## E3 — Trust: every number checkable

### US-011 — Drill from a count to its occurrences and play them
*As Rafa, I want to click any count and hear the moments behind it, so that I can catch the product lying before I post the number.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Every occurrence of a term is enumerated
  Given an Episode whose count for "hotdog" is 17
  When I select the term
  Then exactly 17 occurrences are listed
  And each shows an episode-relative timestamp and the surrounding Segment text
  And every listed Segment text contains a token matching the term

Scenario: Playback seeks to the occurrence
  Given an occurrence of "hotdog" at 1:08:42
  When I select it
  Then playback begins between 1:08:40 and 1:08:42

Scenario: A zero count offers no drill-down
  Given an Episode whose count for "hotdog" is 0
  Then the count renders as 0 and no occurrence list is offered
```

### US-015 — Keep filler and function words out of the way
*As Rafa, I want the top of the list to be actual subject matter, so that the headline is not "the".*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Stop words are excluded from display but never from storage
  Given a Transcript where "the" occurs 2 100 times and "hotdog" 61 times
  Then "the" does not appear in the top-words list and "hotdog" does
  When I turn off stop-word filtering
  Then "the" appears with the count 2 100

Scenario: An explicitly tracked stop word is always counted
  Given a Topic "can of worms" containing the Term "can"
  And a Transcript where "can" occurs 14 times
  Then the Topic reports 14 mentions with stop-word filtering on
```

### US-017 — Count phrases, so a running joke can be more than one word
*As Rafa, I want "hot dog" counted as one thing however it is spelled, so that the bit is countable.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Spelling, separator and plural variants collapse to one Term
  Given a Transcript containing "hot dog" twice, "hotdog" three times, "hot-dog" once and "hotdogs" once
  When the Term "hotdog" is counted
  Then the count is 7

Scenario: Phrases are reported in their own right
  Given a Transcript containing "conspiracy corner" 9 times
  Then "conspiracy corner" appears in the phrase statistics with the count 9

Scenario: A phrase never matches across two hosts
  Given the word "hot" is attributed to Rafa and the next word "dog" to Mel
  When the Term "hot dog" is counted
  Then the count is 0
```

---

## E4 — Running jokes: the headline feature

### US-019 — Define a running joke as a tracked Topic
*As Rafa, I want to name a bit and list the words we use for it, so that the count tracks the joke and not one spelling.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: A Topic is created with alias Terms
  When I create the Topic "the hotdog thing" with Terms "hotdog", "hot dog" and "sausage"
  Then it exists in my Library with 3 Terms
  And it applies to every current and future Episode

Scenario: Bad input and limits are rejected with specific messages
  Given a Topic named "the hotdog thing" exists
  When I create another named "The Hotdog Thing"
  Then it is rejected with "A topic named 'the hotdog thing' already exists."
  When I create a Topic with no Terms
  Then it is rejected with "Add at least one term to this topic."
  When I add a Term of 6 words
  Then it is rejected with "A term can be at most 5 words."
  When I add a 21st Term, or a 51st Topic
  Then each is rejected naming the limit, 20 terms and 50 topics
```

### US-020 — See running-joke counts for one episode
*As Rafa, I want each episode to report every tracked bit, so that "did we do the hotdog thing" is answered instantly.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Topic counts appear on the Episode and sum their Terms
  Given the Topic "the hotdog thing" with Terms "hotdog", "hot dog" and "sausage"
  And a Transcript containing "hotdog" 12 times, "hot dog" 3 times and "sausage" 2 times
  Then the Topic reports 17 mentions

Scenario: Overlapping Terms are not double-counted
  Given the Topic contains both "hotdog" and "hotdog thing"
  And a Transcript containing "hotdog thing" exactly once and no other "hotdog"
  Then the Topic reports 1 mention

Scenario: An unmentioned Topic shows zero, not nothing
  Given the Topic "conspiracy corner" and a Transcript with none of its Terms
  Then the Topic reports 0 mentions

Scenario: Topic counts drill down to quotes
  Given the Topic reports 17 mentions
  When I select it
  Then 17 timestamped occurrences are listed
```

---

## E5 — The Series: the part that is actually the product

### US-038 — A Series of numbered episodes, listed with their numbers
*As Rafa, I want my episodes to be a show, so that the app is about a series and not a folder of files.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: An Episode belongs to a Series, carries a number, and can be retitled
  Given a Series named "Three Bean Podcast" and an Episode titled "riverside_0042"
  Then the Episode has an episode number and a recorded-on date
  And the next Episode added defaults to the next number
  When I set another Episode's number to an existing one
  Then it is rejected with "Episode 12 already exists in this series."
  When I rename the Episode to "Hotdog Summit"
  Then the listing reads "12 · Hotdog Summit" and the source filename is still recorded
  And an empty title is rejected with "Give this episode a title."

Scenario: Episodes list newest first with Topic chips
  Given 12 ready Episodes and 2 Topics
  When I open the Series
  Then 12 rows are listed in descending episode number
  And each row shows number, title, recorded-on date, duration and status
  And each ready row shows a mention-count chip per Topic
  When I filter by status "ready"
  Then only ready Episodes are listed
```

### US-022 — See one running joke across every episode
*As Rafa, I want a bit's count per episode in order, so that I can see whether it is taking over the show.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Per-episode counts in episode order
  Given 6 ready Episodes numbered 1 to 6
  And the Topic "the hotdog thing" with counts 3, 0, 9, 14, 22, 18
  When I open the Topic
  Then the 6 counts are listed in ascending episode order
  And a total of 66 mentions across 6 episodes is reported

Scenario: Normalised rate is shown alongside raw counts
  Given a 60-minute Episode with 10 mentions and a 120-minute Episode with 12 mentions
  Then mentions per hour are reported as 10 and 6 respectively

Scenario: No trend claimed below three episodes
  Given 2 ready Episodes
  Then per-episode counts are listed and no trend direction is claimed

Scenario: Episodes still processing are excluded, not counted as zero
  Given 5 ready Episodes and 1 with status "transcribing"
  Then 5 Episodes are included and I see "1 episode is still processing."
```

### US-042 — See the season's running-joke leaderboard
*As Rafa, I want every tracked bit ranked across the season, so that I get the one number worth screenshotting.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Topics are ranked by total mentions across the Series
  Given a Series of 12 ready Episodes
  And Topics with Series totals "anyway" 312, "the hotdog thing" 212 and "conspiracy corner" 46
  When I open the Series leaderboard
  Then the three Topics are listed in that order with those totals
  And each row shows how many of the 12 episodes it appeared in
  And the sum of "the hotdog thing" per-episode counts equals 212

Scenario: A Series with one episode says so instead of showing a season
  Given a Series with 1 ready Episode
  Then the leaderboard covers that episode only
  And I see "Add another episode to compare across the series."
```

### US-026 — Apply a new running joke to past episodes
*As Rafa, I want a bit I invented in episode 12 counted across episodes 1 to 11, so that the back catalogue answers new questions.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: A new Topic is applied to existing Episodes on request
  Given 12 ready Episodes
  When I create the Topic "conspiracy corner" and apply it to existing Episodes
  Then all 12 Episodes report a mention count for it
  And no transcription request is made and no allowance is consumed
  And a new Analysis records the new pipeline version while the Transcript id is unchanged
  And the operation completes within 10 seconds

Scenario: Episodes without a Transcript are reported as skipped
  Given an Episode with status "failed"
  When I apply a new Topic to existing Episodes
  Then it is reported as skipped with the reason "no transcript"
```

### US-035 — One query engine behind every number
*As Rafa, I want the episode page, the leaderboard and the share page to agree, so that I never wonder which number is the real one.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: A Query counts across a Series with provenance
  Given 12 ready Episodes and the Term "hotdog"
  When I run a Query over the whole Series
  Then a total mention count, a matching-episode count, and the earliest and latest match dates are returned
  And every match carries episode_id, start_ms and the Segment text
  When I run a Query for a Term that never occurs
  Then the total is 0, the matching-episode count is 0, and no error is raised

Scenario: Every surface agrees with the engine
  Given an Episode page reporting the Topic "the hotdog thing" as 17
  Then a Query for that Topic scoped to that Episode returns 17
  And the Series leaderboard's contribution from that Episode is 17
  And the Episode's public share page shows 17
```

---

## E6 — Who talked most, without diarisation and without double-counting

**The design, stated once:** the mixed master file is transcribed **once** and is the only source of words. Each host's track is used **only as an energy signal** — for every word in the master transcript, whichever host's track is loudest at that word's timestamp is credited with it. No host track is ever transcribed.

Transcribing host tracks separately would **double-count every sentence**, because each mic picks up the other hosts faintly and the same words land in two transcripts. It would also cost 3 × 2 = 6 audio-hours for one episode against an allowance of 2 per hour.

> **Recommendation to architecture:** compute each track's energy envelope in the browser and upload only the envelope (a few KB per track), not the host audio. Host tracks then cost nothing in storage and nothing in transcription. The criteria below are satisfied by either implementation.

### US-037 — Upload per-host tracks for attribution
*As Rafa, I want to hand over my three Riverside tracks alongside the master, so that speaker stats are exact instead of guessed.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: A master plus per-host tracks becomes one Episode
  When I upload a master file and 3 host tracks in one action and name each host
  Then one Episode is created with 1 master and 3 host tracks
  And only the master is chunked and sent for transcription
  And the allowance consumed equals the master's duration, not four times it
  And I see "This episode uses 2h00m of today's 8-hour transcription budget — about a quarter of it."

Scenario: Tracks that do not line up are flagged, and the track limit holds
  Given host tracks whose durations differ from the master by more than 2 percent
  Then I see "These tracks are a different length from the master. Overtone aligns them from the start of each file; attribution may drift."
  When I upload 7 host tracks
  Then it is rejected with "An episode can have at most 6 host tracks."

Scenario: A master alone is accepted and says what it cannot do
  When I upload only a mixed file
  Then the Episode is created and analysed normally
  And no speaker breakdown is rendered
  And I see "Upload one track per host to see who talked most."
```

### US-014 — Attribute every word to a host, and report who talked most
*As Rafa, I want to see who talked most and who says what, so that an argument the group has every week gets settled.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Attribution partitions the words and never duplicates them
  Given an Episode whose master transcript contains 18 400 words and 3 host tracks
  When attribution completes
  Then every word is attributed to exactly one Speaker or to "unknown"
  And the sum of per-Speaker word counts plus unknown equals 18 400
  And the Episode's total word count is unchanged by attribution
  And each Speaker's talk time is reported in seconds and as a percentage summing to 100 within 1 point

Scenario: Mic bleed does not create duplicate words
  Given a sentence spoken once by Rafa and audible faintly on Mel's track
  Then that sentence appears exactly once in the Transcript
  And its words are attributed to Rafa

Scenario: Per-host term counts partition the total
  Given an Episode whose total count for "hotdog" is 10
  Then the sum of per-Speaker counts for "hotdog" equals 10

Scenario: Ambiguous moments are "unknown", not guessed
  Given a word where no host track is more than 3 dB above the others
  Then it is attributed to "unknown"
  And if more than 20 percent of words are unknown I see "Speaker attribution is unreliable for this episode — the host tracks may be out of sync."

Scenario: Renaming a host updates every surface
  Given a Speaker named "Track 2"
  When I rename it to "Mel"
  Then the transcript, the talk-time split and the per-host counts all read "Mel"
  And Speakers on other Episodes are unchanged
```

---

## E7 — Share it

### US-039 — Share one episode's stats by public link
*As Rafa, I want a link I can paste in the group chat, so that my friends see the numbers without signing in.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Creating a link states exactly what becomes public
  Given a ready Episode
  When I create a share link
  Then an unguessable URL is produced
  And the dialog states "Anyone with this link can see this episode's stats and quotes. They cannot hear the audio, see your other episodes, or see your other series."

Scenario: An anonymous visitor sees the stats and can check them
  When someone opens the link while not signed in
  Then the headline sentence, Topic counts, who-talked-most and top words are rendered
  And selecting a count lists its timestamped quotes
  And no audio playback is offered
  And no horizontal scrolling is required at a viewport 390 pixels wide

Scenario: The link exposes nothing else, and revoking is total
  Given a share link for Episode 12 and another Episode 11 in the same Series
  Then Episode 11 is not reachable
  And the owner's Library, other Series and email address are not disclosed
  And no audio file is reachable from any URL on the page
  When I revoke the link
  Then opening it returns not-found and the Episode itself is unchanged
```

---

## E8 — Living inside the free tier

### US-043 — Say exactly which limit was hit and when it lifts
*As any user, I want the app to name the limit it has reached, so that a shared free-tier ceiling does not look like a bug.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: The hourly and daily allowances are reported in hours, not errors
  Given 2 audio-hours have been transcribed in the last hour across all users
  When I start a 120-minute Episode
  Then the chunks are uploaded, the audio is saved, and the Episode status stays "uploaded"
  And I see "You've used this hour's 2 hours of transcription. Try again in 34 minutes. Your audio is saved."
  And an Analyse action is offered for later
  Given instead that 8 audio-hours have been transcribed today
  Then I see "You've used today's 8 hours of transcription. It resets at 00:00 UTC, in 6 hours. Your audio is saved."

Scenario: Remaining allowance is visible before I commit
  Given 6 of today's 8 audio-hours are used
  When I open the upload screen
  Then I see "2h00m of today's 8 hours remain — room for one more 2-hour episode."

Scenario: The request rate limit is absorbed, not surfaced
  Given a 6-chunk Episode
  When the service returns a rate-limit response on chunk 4
  Then chunk 4 is retried after a delay, the status stays "transcribing", and no failure is shown

Scenario: Storage refuses with a specific remedy
  Given stored audio totals 1 GB
  When I upload an Episode
  Then it is refused with "Storage is full (1 GB of 1 GB). Delete an episode, or purge an old episode's audio and keep its stats."
  And the refusal names how much space this upload needed
```

### US-044 — Backfill a back catalogue in honest batches
*As Rafa, I want to work through 50 old episodes over a couple of weeks, so that the Series covers the whole show.*
Priority: **Should** · Size: **M**

```gherkin
Scenario: The plan is stated in days and gigabytes before anything starts
  Given 50 unanalysed episodes averaging 110 minutes
  When I open backfill
  Then I see "That is about 92 hours of audio: 4 episodes a day, roughly 13 days."
  And I see "50 episodes would need about 1.1 GB of storage and you have 1 GB. Overtone will purge each episode's audio after analysing it and keep the stats."

Scenario: Today's batch runs, the rest keep their place, and this week's episode jumps the line
  Given today's allowance covers 4 episodes
  When I start the backfill
  Then 4 Episodes reach status "ready" and the remaining 46 stay "uploaded" marked "waiting for tomorrow's allowance"
  And choosing Continue the next day processes the next 4
  When I upload a new Episode mid-backfill
  Then it is analysed before any remaining backfill episode
```

> **Deliberately not a queue.** There is no worker and no scheduler (ADR 0010). Backfill is a saved intent plus a Continue button pressed on return. Four episodes a day tolerates a manual nudge, and a second runtime to save one click is not worth it.

---

## E9 — Making the number land, and cleaning up

### US-027 — The episode page, and what it looks like when there is nothing yet
*As Rafa, I want one page that tells me what this episode became, so that I do not assemble the story from widgets.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: The page renders a fixed, ordered hierarchy
  Given a ready Episode
  Then it renders in this order: any warning banner, headline sentence, running-joke counts, who talked most, top words, link to the transcript
  And the headline and top three terms are visible without scrolling at 1280 by 800
  And every rendered count is actionable and opens its occurrence list
  Given instead an Episode with status "transcribing"
  Then the chunk progress from US-002 is shown and no empty statistics sections are rendered

Scenario: Empty states offer exactly one thing to do
  Given a signed-in user with 0 Episodes
  Then exactly one primary action is offered, to add an episode
  And it states the accepted formats, that episodes up to 150 minutes are fine, and that one track per host enables speaker stats
  And no empty charts or placeholder widgets are rendered
  Given instead a ready Episode and 0 Topics
  Then the running-jokes area invites me to track a suggested term rather than rendering an empty chart
```

### US-025 — Delete an episode permanently
*As any user, I want deletion to be real, so that I trust the app with recordings of my friends.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Deletion names what it destroys, then destroys it
  Given a ready Episode titled "Hotdog Summit"
  When I choose Delete
  Then the confirmation names "Hotdog Summit" and states "This permanently deletes the audio, transcript and all statistics."
  When I confirm
  Then the Episode disappears from the Series immediately
  And its Transcript, Segments, Tokens and Analyses are not retrievable by any request
  And any share link for it returns not-found
  And all its chunks and host tracks are purged from storage within 24 hours

Scenario: Deletion updates Series-wide counts
  Given the Topic "the hotdog thing" reported 212 mentions across 12 Episodes
  And one Episode contributed 22
  When I delete that Episode
  Then the Topic reports 190 mentions across 11 Episodes
```

---

## Named, sized, and specified when pulled

| ID | Story | Priority | Size | Why it waits |
|---|---|---|---|---|
| US-021 | Suggest running jokes from the episode's own top terms | Should | S | Solves the blank-page problem, which only exists once US-019 ships |
| US-018 | Filler-word and pace stats ("Mel says 'like' 4.2 times a minute") | Should | S | Pure fun, on-brand, no dependencies. First thing to pull after the Musts |
| US-016 | Group inflections (`run`/`running`/`ran`) with an exact-words toggle | Should | M | D4 is settled; the toggle is display logic over data US-004 already stores |
| US-034 | Purge an episode's audio, keep its stats | Should | S | The pressure valve for the 1 GB ceiling, and a dependency of US-044 |
| US-012 | Quality warning when mean confidence is below 70 | Should | S | Podcast audio is usually good; matters the first time someone records in a car |
| US-010 | Read the transcript with timestamps, searchable in-page | Should | M | Useful for show notes. US-011's quotes already cover the trust case |
| US-041 | Compare two episodes side by side | Should | S | Trivial once US-035 exists; US-022 answers most of the same question |
| US-009 | Skip a duplicate upload by content hash | Should | S | Protects a shared allowance from being spent twice on the same audio |
| US-013 | Refuse non-English audio with the detected language named | Should | S | A silently-wrong Portuguese word count is worse than a refusal |
| US-029 | Keyboard reachability and WCAG AA contrast baseline | Should | S | Phone readability is already AC on US-039, where it matters most |
| US-033 | Delete my account and everything in it | Should | S | Right and cheap; nobody has joined yet |
| US-031 | Export the transcript as TXT or SRT | Could | S | Show notes. Share links cover "show someone" first |

---

## Deleted from earlier drafts

| Was | What happened |
|---|---|
| US-006 Reject unsupported formats | Folded into **US-007** — one story owns "bad input, with the fix attached" |
| US-023 Browse the Library · US-024 Rename a recording | Folded into **US-038**, which owns the Series, its numbering and its listing |
| US-028 First-run and empty states | Folded into **US-027**; an empty state is a state of that page, not a story |
| US-030 Export statistics as CSV | **Deleted.** Share links are how a podcast shows someone a number. A CSV is for a product with a spreadsheet user |
| US-036 Save and re-run a Query | **Deleted.** US-022 and US-042 *are* the saved queries, named in the user's own words |
| US-014 *as* automatic diarisation | **Rewritten, id kept.** The free service does no diarisation and buying one costs money. US-014 now means energy attribution over a once-transcribed master (E6): exact, free, and unable to be confidently wrong about what was said |
| "Transcribe each host's track" | **Replaced before it was built.** Mic bleed double-counts every sentence and it costs 3× the allowance. Host tracks are an attribution signal, never a transcription input |
| 200 MB / 120-minute caps, "convert to mp3 to fit" | **Replaced** by chunked Opus uploads (US-040). A two-hour episode is normal and needs no advice from us |
| "You can close this page, processing continues" | **Reversed.** No worker, no queue (ADR 0010). US-002 owns resume-after-close instead of a promise the architecture cannot keep |
| Old privacy epic (DPA, consent flows, retention policy, legal review) | Reduced to US-032, US-025 and US-033. There is no business to defend |

---

## Not for this app

| Deliberately not building | Reason |
|---|---|
| **Natural-language assistant** ("how many times did we ever mention hotdogs") | The north star, and cheap *later* precisely because US-035 exists. Not now: it needs an eval harness and a prompt-injection story on top of a pipeline nobody has used |
| Machine-discovered topic clustering | A podcast group already knows its bits by name (ADR 0006). Clusters are unstable across episodes, which would make the Series view — the whole product — meaningless |
| Automatic diarisation of a mixed file | Not available free, and a confidently wrong speaker label is worse than none |
| Fuzzy or phonetic matching of mishearings | Trades invisible false negatives for invisible false positives with no eval set (D9) |
| Sentiment, emotion, summarisation, "best clip" detection | Unfalsifiable. Every claim in this app must be a count a test can assert |
| Non-English analysis | One epic per language: stop-word list, lemmatiser, tokenisation. US-013 refuses honestly instead |
| Video files, live transcription, bots joining calls | A different product |
| Teams, shared libraries, roles, per-episode permissions | Each friend has their own Library; sharing is a link. An authorisation model would slow every story for a group of four |
| A background worker, a job queue, or a cron scheduler | ADR 0010 deleted all three. Even backfill is a saved intent plus a button |
| Billing, plans, quotas, spend alerts, cost dashboards | There is no spend. The only budget is the free tier, and US-043 owns it |
| PII redaction, DPAs, consent flows, mobile apps | Scoped for enterprise buyers. This app has friends who know they are being recorded, and a phone-first share page |

---

## What must stay true in the data model

1. **Episode-relative timestamps everywhere.** Chunk offsets are applied once, at stitching, never again. US-040, asserted in US-004 and US-011. Getting this wrong points every drill-down quote at the wrong moment, silently.
2. **One transcription per episode, one word list.** The master is the only transcription input; host tracks are an attribution signal. Asserted by US-014's "sum of per-Speaker counts equals the total" — the test that keeps mic bleed from inflating every number.
3. **Token-level provenance** — `episode_id`, `chunk_id`, `segment_id`, `speaker_id`, `start_ms`, `surface`, `normalized`, `lemma`. US-004. Drill-down and per-host group-by cannot be retrofitted cheaply.
4. **One count engine, every surface.** Episode page, Series leaderboard, share page, and later the assistant, all execute the same Query. US-035's agreement scenario is the regression test that keeps every future surface honest.
5. **Transcripts and raw chunk payloads retained.** Retroactive Topic application (US-026) is the most valuable thing the app does, and it is free only because nothing is ever re-transcribed.
