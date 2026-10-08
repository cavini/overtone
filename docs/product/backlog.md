# Overtone — Product Backlog

**Reading order is delivery order.** E1 is the walking skeleton: sign in, upload one short file, see one real number. E2 comes immediately after, because **a real episode is two hours long** and the skeleton only handles a two-minute one.

**Priority** = MoSCoW, scoped to the first release. **Size** = S (≤ 1 day) / M (1–3 days) / L (> 3 days — split before it is Ready).

**Only first-release stories carry Gherkin here.** The rest are named, sized and argued for in one line each; their acceptance criteria are written when they are pulled. Pre-writing a hundred scenarios for stories nobody has started is the waterfall this project exists to avoid.

Domain nouns are in `glossary-and-domain.md`. Statuses are exactly `uploaded`, `transcribing`, `analyzing`, `ready`, `failed`, `deleting`.

**Two facts shape every scenario below.** The show is recorded **in Brazilian Portuguese**, so the counting rules are pt-BR rules (D2–D6, D14) and **all example data is pt-BR** — English fixtures would let an accent-stripping bug ship green. And an episode arrives as **one already-edited file** (D15), so there is no track-set concept anywhere and no speaker dimension at all.

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
| **Language** | **`pt` — Brazilian Portuguese**, set explicitly on every transcription request, never auto-detected | The language the show is recorded in. Auto-detect misfires on accented and code-switched speech, and per-chunk detection could return different languages for one episode (D14) |
| Normalization | **Unicode NFC + lowercase + strip leading/trailing punctuation.** Diacritics preserved; no `unaccent`/NFD-strip anywhere | `e`/`é`, `por`/`pôr`, `esta`/`está`, `as`/`às` are different words (D2) |
| Stop-word list | **pt-BR, ~200 items, versioned** alongside the normalization version | Larger than the English list it replaces: mandatory contractions and auxiliary inflections multiply the entries (D5) |
| Clitic-pronoun list (closed) | `me, te, se, lhe, lho, nos, vos, lo, la, los, las, no, na` | A trailing hyphen plus one of these splits; everything else keeps its hyphen. `o, a, os, as` are deliberately excluded so compounds stay safe (D3) |
| Default top-N words | 25 | |
| Quality warning threshold | mean confidence < 70 / 100 | |
| Topic limits | ≤ 50 Topics/Library · ≤ 20 Terms/Topic · ≤ 5 words/Term | |
| **Audio files per Episode** | **exactly 1** — the final edited episode | They upload only the published file, so there is no per-host signal and no speaker dimension (D15) |
| Share links | one per Episode, unguessable, revocable, **counts and quotes only — never the full transcript** | Settled by the stakeholder |

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
  And I have a 2-minute pt-BR file named "ep12-final.m4a"
  When I confirm the upload
  Then an Episode is created with status "uploaded" and the title "ep12-final"
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

Scenario: Every request declares the language
  Given an Episode of 6 chunks
  When transcription runs
  Then every one of the 6 requests carried language "pt"
  And no request relied on language auto-detection

Scenario: The transcript is good enough to count, and survives re-analysis
  Given the fixture "fixture-hotdog-60s-ptbr.m4a" whose pt-BR script says "hotdog" 5 times
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
  Then every Token stores episode_id, chunk_id, segment_id, position, start_ms, surface, normalized, lemma and lemma_source
  And start_ms is relative to the start of the Episode, not of its chunk
  And punctuation characters produce no Tokens

Scenario: Counts are case- and punctuation-insensitive
  Given a Transcript containing "Churrasco, churrasco. CHURRASCO!"
  Then the count for the term "churrasco" is 3

Scenario: Diacritics are never stripped
  Given a Transcript containing "e é e é por pôr esta está as às"
  Then the count for "e" is 2 and the count for "é" is 2
  And the counts for "por", "pôr", "esta", "está", "as" and "às" are each 1
  And the normalized form of the Token "é" is "é", not "e"
  And no stored normalized form contains a Unicode combining mark

Scenario: Enclitic pronouns split off the verb; compounds stay whole
  Given a Transcript containing "diga-me fazê-lo dá-se vamo-nos guarda-chuva fim-de-semana segunda-feira"
  Then the Tokens "diga", "me", "fazê", "lo", "dá", "se", "vamo" and "nos" each exist
  And "guarda-chuva", "fim-de-semana" and "segunda-feira" are each exactly one Token
  And the lemma of the Token "fazê" is "fazer" and the lemma of "dá" is "dar"
  Given instead a Transcript containing "dá-o vê-a"
  Then "dá-o" and "vê-a" are each one Token, because "o" and "a" are not on the clitic list

Scenario: Mandatory contractions are one Token and are never expanded
  Given a Transcript containing "do na pelo nele àquela"
  Then 5 Tokens are indexed and none is expanded into two words

Scenario: A count does not move because the transcriber chose the written spelling
  Given the Topic "tá ligado" with the Terms "tá ligado" and "está ligado"
  And the fixture "fixture-ta-ligado-spoken.json", in which the provider wrote "tá ligado" 5 times
  And the fixture "fixture-ta-ligado-written.json" — the same speech — in which it wrote "está ligado" 5 times
  Then the Topic reports 5 mentions against both fixtures
  And the Term "tá ligado" alone reports 5 against the first and 0 against the second
  And each occurrence names the surface form that produced it

Scenario: Analysis records its configuration for reproducibility
  Given an Episode with status "ready"
  Then its Analysis records the language, the normalization, stop-word list, lemma dictionary and pipeline versions
  And re-running analysis with the same configuration yields identical counts
```

### US-005 — See the top words for one episode
*As Rafa, I want the words that dominated the episode, so that I learn something in five seconds.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Top words are ranked, with stop words excluded
  Given an Episode whose top three terms are "hotdog" 61, "churrasco" 44 and "basicamente" 31
  Then at most 25 terms are listed by count descending
  And no listed term appears on the active pt-BR stop-word list
  And the page headline names those three terms with those three counts
  And I see the total word count, the duration and words per minute

Scenario: Inflections are grouped by default, and the merge is visible
  Given a Transcript containing "falou" 5 times, "falei" 4 times, "falar" 3 times and "falando" 2 times
  Then the list shows the term "falar" with the count 14
  And expanding it lists "falou 5 / falei 4 / falar 3 / falando 2"
  And any form grouped by the stemmer rather than the dictionary is marked as heuristic

Scenario: Over-merges that a stemmer would make are not made, and would be visible if they were
  Given a Transcript containing "casa" 20 times, "casar" 4 times, "com" 300 times and "comer" 9 times
  Then "casa" and "casar" are reported as two separate terms
  And "comer" is not grouped with "com"
  And every grouped count in the list can be expanded to the surface forms behind it

Scenario: An episode with no speech is reported honestly
  Given a 30-second Episode containing only silence
  Then its status is "ready" and I see "No speech detected in this recording."
  And no top-words list is rendered
```

---

## E2 — Real episodes: two hours, chunked

**This epic is the main flow, not a fallback.** The show records 100–120 minutes. Everything here runs on every upload. One file arrives — the published edit — and chunking is unchanged by that (D15).

### US-040 — Upload a two-hour episode as silence-cut chunks
*As Rafa, I want a two-hour episode to just work, so that I never have to open an audio editor to use a fun app.*
Priority: **Must** · Size: **L** → split: decode and compress · silence-boundary splitting · parallel transcription and stitching

```gherkin
Scenario: A two-hour episode is chunked, compressed and uploaded
  Given a 120-minute 160 MB wav file
  When I select it
  Then I see "This episode is 2h00m. That is 2h00m of today's 8-hour transcription budget — about a quarter of it."
  When I confirm the upload
  Then the browser splits it into 5 or 6 chunks of 20 to 25 minutes
  And each chunk is encoded as 16 kHz mono Opus and is at most 25 MB
  And the original file is never uploaded
  And progress is reported per chunk
  And exactly one audio file was asked for, with no track-set or per-host step

Scenario: Splitting never cuts a word in half
  Given a file whose 25-minute mark falls in the middle of the word "cachorro-quente"
  When the file is split
  Then the cut is moved to the nearest silence of at least 300 milliseconds
  And the cut is within 90 seconds of the nominal chunk length
  And the fixture's full word sequence is recoverable from the chunks with no word lost and none duplicated

Scenario: A two-hour episode produces one set of counts matching its script
  Given the fixture "fixture-2h-script-ptbr.wav" whose pt-BR script says "hotdog" 184 times across 6 chunks
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
  Given an Episode whose count for the Term "hotdog" is 17
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
  Given a Transcript where "que" occurs 2 100 times and "hotdog" 61 times
  Then "que" does not appear in the top-words list and "hotdog" does
  When I turn off stop-word filtering
  Then "que" appears with the count 2 100

Scenario: Clitic pronouns split off by tokenisation land on the stop-word list
  Given a Transcript containing "diga-me" 12 times
  Then the top-words list does not contain "me"
  And the Term "dizer" includes those 12 occurrences

Scenario: An explicitly tracked stop word is always counted
  Given a Topic "né" containing the Term "né"
  And a Transcript where "né" occurs 340 times
  Then the Topic reports 340 mentions with stop-word filtering on
```

### US-017 — Count phrases, so a running joke can be more than one word
*As Rafa, I want "hot dog" counted as one thing however it is spelled, so that the bit is countable.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Spelling, separator and plural variants collapse to one Term
  Given a Transcript containing "hot dog" twice, "hotdog" three times, "hot-dog" once and "hotdogs" once
  When the Term "hotdog" is counted
  Then the count is 7

Scenario: Gender and number agreement does not need a separate Term
  Given the Term "linguiça bonita"
  And a Transcript containing "a linguiça bonita" once, "as linguiças bonitas" twice and "a linguiça feia" once
  Then the count is 3
  And a leading article in a Term is ignored, so "o hotdog", "os hotdogs" and "hotdog" are one Term

Scenario: Phrases are reported in their own right
  Given a Transcript containing "conspiração do Davi" 9 times
  Then "conspiração do Davi" appears in the phrase statistics with the count 9

Scenario: A phrase matches across a chunk join but never across a gap
  Given the words "hot" and "dog" fall either side of a chunk boundary
  When the Term "hot dog" is counted
  Then the count is 1
  Given instead a Transcript containing "hot e dog"
  Then the count for "hot dog" is 0
```

---

## E4 — Running jokes: the headline feature

### US-019 — Define a running joke as a tracked Topic
*As Rafa, I want to name a bit and list the words we use for it, so that the count tracks the joke and not one spelling.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: A Topic is created with alias Terms
  When I create the Topic "a parada do hotdog" with Terms "hotdog", "hot dog", "cachorro-quente" and "dogão"
  Then it exists in my Library with 4 Terms
  And it applies to every current and future Episode

Scenario: A spoken form is offered its written-standard variant as an alias
  When I add the Term "tá ligado"
  Then "está ligado" is offered as an alias, already selected, with the reason "the transcriber may write it this way"
  When I add the Term "né"
  Then "não é" is offered the same way
  And I can decline either without losing the Term

Scenario: Bad input and limits are rejected with specific messages
  Given a Topic named "a parada do hotdog" exists
  When I create another named "A Parada do Hotdog"
  Then it is rejected with "A topic named 'a parada do hotdog' already exists."
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
  Given the Topic "a parada do hotdog" with Terms "hotdog", "hot dog" and "cachorro-quente"
  And a Transcript containing "hotdog" 12 times, "hot dog" 3 times and "cachorro-quente" 2 times
  Then the Topic reports 17 mentions

Scenario: Overlapping Terms are not double-counted
  Given the Topic contains both "hotdog" and "hotdog thing"
  And a Transcript containing "hotdog thing" exactly once and no other "hotdog"
  Then the Topic reports 1 mention

Scenario: An unmentioned Topic shows zero, not nothing
  Given the Topic "a conspiração do Davi" and a Transcript with none of its Terms
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
  Given a Series named "Papo de Três" and an Episode titled "ep42_final_v3"
  Then the Episode has an episode number and a recorded-on date
  And the next Episode added defaults to the next number
  When I set another Episode's number to an existing one
  Then it is rejected with "Episode 12 already exists in this series."
  When I rename the Episode to "Cúpula do Hotdog"
  Then the listing reads "12 · Cúpula do Hotdog" and the source filename is still recorded
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
  And the Topic "a parada do hotdog" with counts 3, 0, 9, 14, 22, 18
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
  And Topics with Series totals "né" 312, "a parada do hotdog" 212 and "a conspiração do Davi" 46
  When I open the Series leaderboard
  Then the three Topics are listed in that order with those totals
  And each row shows how many of the 12 episodes it appeared in
  And the sum of "a parada do hotdog" per-episode counts equals 212

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
  When I create the Topic "a conspiração do Davi" and apply it to existing Episodes
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
  Given an Episode page reporting the Topic "a parada do hotdog" as 17
  Then a Query for that Topic scoped to that Episode returns 17
  And the Series leaderboard's contribution from that Episode is 17
  And the Episode's public share page shows 17
```

---

> **E6 is gone and its number is retired.** It was "who talked most": per-host upload (US-037) and energy attribution (US-014). Only the final edited file is uploaded, so the signal does not exist — the epic is **deleted, not deferred**. See *Deleted from earlier drafts*.

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
  And the dialog states "Anyone with this link can see this episode's counts and the quotes behind them. They cannot read the full transcript, hear the audio, see your other episodes, or see your other series."

Scenario: An anonymous visitor sees the counts and can check them
  When someone opens the link while not signed in
  Then the headline sentence, Topic counts and top words are rendered
  And selecting a count lists its timestamped quotes
  And no audio playback is offered
  And no horizontal scrolling is required at a viewport 390 pixels wide

Scenario: The link exposes counts and quotes, and nothing else
  Given a share link for Episode 12 and another Episode 11 in the same Series
  Then the full Transcript is not reachable from the page or from any API it calls
  And the quotes returned are only the Segments that produced a rendered count
  And Episode 11 is not reachable
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
  Then it renders in this order: any warning banner, headline sentence, running-joke counts, top words, link to the transcript
  And one line states that the counts describe the published episode, as transcribed
  And the headline and top three terms are visible without scrolling at 1280 by 800
  And every rendered count is actionable and opens its occurrence list
  Given instead an Episode with status "transcribing"
  Then the chunk progress from US-002 is shown and no empty statistics sections are rendered

Scenario: Empty states offer exactly one thing to do
  Given a signed-in user with 0 Episodes
  Then exactly one primary action is offered, to add an episode
  And it states the accepted formats, that episodes up to 150 minutes are fine, and that Overtone analyses Brazilian Portuguese
  And no empty charts or placeholder widgets are rendered
  Given instead a ready Episode and 0 Topics
  Then the running-jokes area invites me to track a suggested term rather than rendering an empty chart
```

### US-025 — Delete an episode permanently
*As any user, I want deletion to be real, so that I trust the app with recordings of my friends.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Deletion names what it destroys, then destroys it
  Given a ready Episode titled "Cúpula do Hotdog"
  When I choose Delete
  Then the confirmation names "Cúpula do Hotdog" and states "This permanently deletes the audio, transcript and all statistics."
  When I confirm
  Then the Episode disappears from the Series immediately
  And its Transcript, Segments, Tokens and Analyses are not retrievable by any request
  And any share link for it returns not-found
  And all its chunks are purged from storage within 24 hours

Scenario: Deletion updates Series-wide counts
  Given the Topic "a parada do hotdog" reported 212 mentions across 12 Episodes
  And one Episode contributed 22
  When I delete that Episode
  Then the Topic reports 190 mentions across 11 Episodes
```

---

## Named, sized, and specified when pulled

| ID | Story | Priority | Size | Why it waits |
|---|---|---|---|---|
| US-021 | Suggest running jokes from the episode's own top terms | Should | S | Solves the blank-page problem, which only exists once US-019 ships |
| US-018 | Filler-word and pace stats ("this episode says 'né' 4.2 times a minute") | Should | S | Pure fun, on-brand, no dependencies. First thing to pull after the Musts. **Must be labelled as measuring the published edit, not anyone's speech habits** (D15), and is per-episode only — there is no speaker to attribute it to |
| US-016 | An "exact words" toggle over the lemma-grouped default | Should | M | The grouping itself is **not** deferred — pt-BR needs it to say anything at all, so it ships in US-004/US-005 (D4). US-016 is only the toggle, which is display logic over data already stored |
| US-034 | Purge an episode's audio, keep its stats | Should | S | The pressure valve for the 1 GB ceiling, and a dependency of US-044 |
| US-012 | Quality warning when mean confidence is below 70 | Should | S | Podcast audio is usually good; matters the first time someone records in a car |
| US-010 | Read the transcript with timestamps, searchable in-page | Should | M | Useful for show notes. US-011's quotes already cover the trust case |
| US-041 | Compare two episodes side by side | Should | S | Trivial once US-035 exists; US-022 answers most of the same question |
| US-009 | Skip a duplicate upload by content hash | Should | S | Protects a shared allowance from being spent twice on the same audio |
| US-013 | Warn when an episode does not look like Brazilian Portuguese | Should | S | **Inverted: pt-BR is the supported language and English audio is the odd case.** It cannot be a pre-upload refusal, because the language is declared rather than detected (D14) and detecting it costs the allowance. So it is an after-the-fact banner off the quality score plus a language-ID check on one chunk — a pt-BR pipeline run over English audio produces confident nonsense, and saying so beats a silently-wrong word count |
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
| **Epic E6, US-014 and US-037** — who talked most, per-host upload, energy attribution | **Deleted, ids retired.** They needed per-host tracks and only the final edited file is uploaded (D15). Nothing in the free stack can attribute a word to a person from one mixed file, so this is **removed from the product, not deferred** — no flag, no *Later* lane, no estimate |
| `speaker_id` on a Token · the Query's speaker filter · the `Host Track`, `Speaker` and `Utterance` nouns · domain decision D13 | **Deleted with E6.** `Segment` is the span a quote and a drill-down point at |
| "Transcribe each host's track" | **Replaced before it was built**, and now moot. Mic bleed double-counts every sentence and it costs 3× the allowance — the reasoning stays on the record in case per-host tracks ever appear |
| English-only normalization: NFKC, intra-word apostrophes, `don't` → `do not` expansion, a ~180-item English stop-word list | **Replaced by the pt-BR rules** (D2–D6). NFC not NFKC, diacritics preserved, enclitic pronouns split off their verbs, mandatory contractions never expanded, and a ~200-item pt-BR stop-word list. Several of these are the *opposite* of the English decision, which is why none of it was a locale setting |
| 200 MB / 120-minute caps, "convert to mp3 to fit" | **Replaced** by chunked Opus uploads (US-040). A two-hour episode is normal and needs no advice from us |
| "You can close this page, processing continues" | **Reversed.** No worker, no queue (ADR 0010). US-002 owns resume-after-close instead of a promise the architecture cannot keep |
| Old privacy epic (DPA, consent flows, retention policy, legal review) | Reduced to US-032, US-025 and US-033. There is no business to defend |

---

## Not for this app

| Deliberately not building | Reason |
|---|---|
| **Natural-language assistant** ("how many times did we ever mention hotdogs") | The north star, and cheap *later* precisely because US-035 exists. Not now: it needs an eval harness and a prompt-injection story on top of a pipeline nobody has used |
| Machine-discovered topic clustering | A podcast group already knows its bits by name (ADR 0006). Clusters are unstable across episodes, which would make the Series view — the whole product — meaningless |
| **Who talks most, in any form** | There is one edited file, so no per-host signal exists, and the free stack has no diarisation. **Removed from the product, not deferred.** A confidently wrong speaker label would be worse than none, and an estimate is the only thing we could build |
| Reconstructing the unedited conversation | We are given the published edit. Counts describe what listeners heard (D15) — the more meaningful number for a podcast, and the only one we have |
| Fuzzy or phonetic matching of mishearings | Trades invisible false negatives for invisible false positives with no eval set (D9) |
| Sentiment, emotion, summarisation, "best clip" detection | Unfalsifiable. Every claim in this app must be a count a test can assert |
| Analysis in any language other than pt-BR | One pipeline per language, not one setting: stop-word list, lemma dictionary, clitic rules, compound handling, normalization. US-013 warns honestly instead |
| Translating or language-tagging code-switched English words | `deploy`, `bug`, `hype` are counted as spelled, as ordinary Tokens (D14). Inflections and alternate spellings are handled by a Term's alias set, which the user controls and can see |
| Video files, live transcription, bots joining calls | A different product |
| Teams, shared libraries, roles, per-episode permissions | Each friend has their own Library; sharing is a link. An authorisation model would slow every story for a group of four |
| A background worker, a job queue, or a cron scheduler | ADR 0010 deleted all three. Even backfill is a saved intent plus a button |
| Billing, plans, quotas, spend alerts, cost dashboards | There is no spend. The only budget is the free tier, and US-043 owns it |
| PII redaction, DPAs, consent flows, mobile apps | Scoped for enterprise buyers. This app has friends who know they are being recorded, and a phone-first share page |

---

## What must stay true in the data model

1. **Episode-relative timestamps everywhere.** Chunk offsets are applied once, at stitching, never again. US-040, asserted in US-004 and US-011. Getting this wrong points every drill-down quote at the wrong moment, silently.
2. **One file in, one transcription, one word list.** An Episode is one audio file and is transcribed exactly once (D15). Asserted by US-040's "no Token appears twice" and by US-003's "no transcription request is made" on re-analysis.
3. **Token-level provenance** — `episode_id`, `chunk_id`, `segment_id`, `start_ms`, `surface`, `normalized`, `lemma`, `lemma_source`. US-004. Drill-down cannot be retrofitted cheaply, and `surface` + `lemma_source` are what make a lemma over-merge visible instead of silent (D4).
4. **One count engine, every surface.** Episode page, Series leaderboard, share page, and later the assistant, all execute the same Query. US-035's agreement scenario is the regression test that keeps every future surface honest.
5. **Transcripts and raw chunk payloads retained.** Retroactive Topic application (US-026) is the most valuable thing the app does, and it is free only because nothing is ever re-transcribed.
6. **Diacritics survive the whole pipeline.** NFC in, NFC stored, NFC compared, NFC rendered (D2). US-004. A single accent-stripping call anywhere — a `deburr`, an `unaccent`, a collation that ignores accents — merges `e` into `é` and makes every count in the app quietly wrong, with nothing in the UI to show it happened.
7. **Every transcription request declares `language: "pt"`.** US-003 asserts it per chunk. Auto-detection could return a different language for different chunks of one episode and stitch half a transcript of confident nonsense (D14).
