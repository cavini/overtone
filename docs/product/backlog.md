# Overtone — Product Backlog

**Reading order is delivery order.** E1 is the walking skeleton: sign in, upload one short file, see one real number. E2 comes immediately after, because **a real episode is two hours long** and the skeleton only handles a two-minute one.

**Priority** = MoSCoW, scoped to the first release. **Size** = S (≤ 1 day) / M (1–3 days) / L (> 3 days — split before it is Ready).

**Only first-release stories carry Gherkin here.** The rest are named, sized and argued for in one line each; their acceptance criteria are written when they are pulled. Pre-writing a hundred scenarios for stories nobody has started is the waterfall this project exists to avoid.

Domain nouns are in `glossary-and-domain.md`. Statuses are exactly `uploaded`, `transcribing`, `analyzing`, `ready`, `failed`, `deleting`.

**Three facts shape every scenario below.** The show is recorded **in Brazilian Portuguese**, so the counting rules are pt-BR rules (D2–D6, D14) and **all example data is pt-BR** — English fixtures would let an accent-stripping bug ship green. An episode arrives as **one already-edited file** (D15), so there is no track-set concept anywhere and no speaker dimension at all. And **the interface is bilingual — pt-BR and English, switchable** (D16) — which changes how every message below is asserted.

### How a user-facing message is asserted

**No scenario asserts a sentence.** A message is a `SCREAMING_SNAKE_CASE` **code** plus named **parameters**. The sentences live once, in two catalogues (`pt-BR` and `en`), and are asserted there by **US-045** — because the text now exists in two languages and **no layer below the presenter is allowed to know which one the reader wants** (D16).

```gherkin
Then the upload is rejected with code `UNSUPPORTED_FORMAT`
And the parameters are { extension: ".docx", accepted: [".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac", ".webm"] }
```

Where the wording *is* the requirement — a limit, a refusal, a disclosure — the scenario also names both renderings, as US-007 and US-043 do. Every code and its parameters are listed in **Message codes** at the end of this doc; that table is the TypeScript union the engineer implements against. The interface language is a **presentation** setting and changes no count (US-046).

### Fixed constants referenced by acceptance criteria

| Constant | Value | Why it is this number |
|---|---|---|
| **Typical episode** | **100–120 minutes** | What the show actually records. Two hours is the normal case, not an edge case |
| **Supported episode length** | **up to 170 minutes** | Set by what a browser can decode without running out of memory (`MAX_EPISODE_MS`), not by the allowance |
| Upload chunk length | **10 minutes**, cut on the nearest gap between words | Keeps a WAV chunk under the 25 MB cap with room for a seam to move ±45 s (ADR 0020) |
| Chunk codec | **16 kHz mono 16-bit WAV** (32 KB/s) | Opus needs a codec in the browser, WAV needs forty-four bytes of header. A 10-minute chunk is ≈ 19 MB; a 2-hour episode ≈ 243 MB, freed as it transcribes (ADR 0031) |
| Max size per chunk | 25 MB (hard service cap) | With WAV this is binding, and it is what sets the 10-minute chunk length |
| **Transcription allowance** | **2 audio-hours per hour · 8 per day, shared across every user** | ≈ **one 2-hour episode per hour, four per day.** Ample for a weekly show, which is the only case there is: no back catalogue is ever imported (see *Not for this app*) |
| Request limits | 20/min · 2 000/day (shared) | Free tier |
| Per-chunk processing ceiling | **120 s** → `failed` | The platform hard-kills a request at 300 s; fail honestly first |
| Total file storage | **1 GB** ≈ 37 two-hour episodes | About nine months of a weekly show before D12's per-episode purge is needed |
| Total database | 500 MB | Free tier |
| Accepted extensions | `.mp3`, `.m4a`, `.wav`, `.aac`, `.ogg`, `.flac`, `.webm` | What the browser can decode |
| **Analysis language** | **`pt` — Brazilian Portuguese**, set explicitly on every transcription request, never auto-detected | The language the show is recorded in. Auto-detect misfires on accented and code-switched speech, and per-chunk detection could return different languages for one episode (D14) |
| **Interface language** | **pt-BR (default) and `en`**, switchable, persisted per user | Both, by stakeholder answer (D16). **A different axis from the analysis language** — the audio is always pt-BR whatever the UI reads |
| Locale formatting | pt-BR `1.234,56` and `08/10/2026` · en `1,234.56` and `10/8/2026` | Numbers are this product's entire output, so a count rendered with the wrong thousands separator is a defect, not a nicety (US-045) |
| Normalization | **Unicode NFC + lowercase + strip leading/trailing punctuation.** Diacritics preserved; no `unaccent`/NFD-strip anywhere | `e`/`é`, `por`/`pôr`, `esta`/`está`, `as`/`às` are different words (D2) |
| Stop-word list | **pt-BR, ~200 items, versioned** alongside the normalization version | Larger than the English list it replaces: mandatory contractions and auxiliary inflections multiply the entries (D5) |
| Clitic-pronoun list (closed) | `me, te, se, lhe, lho, nos, vos, lo, la, los, las, no, na` | A trailing hyphen plus one of these splits; everything else keeps its hyphen. `o, a, os, as` are deliberately excluded so compounds stay safe (D3) |
| Default top-N words | 25 | |
| Quality warning threshold | mean confidence < 70 / 100 | |
| Topic limits | ≤ 50 Topics/Library · ≤ 20 Terms/Topic · ≤ 5 words/Term | |
| **Audio files per Episode** | **exactly 1** — the final edited episode | They upload only the published file, so there is no per-host signal and no speaker dimension (D15) |
| Share links | one per Episode, unguessable, revocable, **counts and quotes only — never the full transcript** | Settled by the stakeholder |

### Walking-skeleton sequence (build in exactly this order)

`US-032` → `US-045` → `US-001` → `US-002` → `US-003` → `US-004` → `US-005` → `US-040`

Sign-in is first because tenancy retrofits badly and because "my friends can use it" is the premise, not a later feature. **US-045 is second because the very first message the app shows — US-001's interrupted upload — already has to come from a catalogue in two languages;** retrofitting that means rewriting every component and every assertion. US-040 is last and not optional: after US-005 the pipeline works on a short file, after US-040 it works on a real episode.

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

### US-045 — Every message comes from a catalogue, in pt-BR and in English
*As Rafa, I want the app in Portuguese, and as Mel I want to show it to a friend who reads English, so that neither of us is reading someone else's language.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: A message is a code and parameters, and only the presenter knows a language
  Given the upload of "notes.docx" is rejected
  Then the rejection carries the code `UNSUPPORTED_FORMAT`
  And the parameters are { extension: ".docx", accepted: [".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac", ".webm"] }
  And no layer below the presenter returned a sentence in any language
  And no domain, use-case or infrastructure module contains a user-facing sentence

Scenario: Both catalogues are complete and every parameter is substituted
  Given the Message codes table at the end of this doc
  Then the pt-BR catalogue and the en catalogue each render every code in it
  And neither catalogue holds a code the other lacks, nor a code absent from the table
  And no rendering contains an unsubstituted placeholder
  And rendering a code with a missing parameter fails the build instead of printing "undefined"

Scenario: Numbers and dates are formatted for the reading locale, never interpolated raw
  Given the count 1234.56 and the date 8 October 2026
  Then pt-BR renders them "1.234,56" and "08/10/2026"
  And en renders them "1,234.56" and "10/8/2026"
  And a 7 245 000 ms duration renders "2h00m" in both
  And every count, rate and date rendered anywhere in the app went through this formatter

Scenario: pt-BR is the default
  Given a new user whose browser asks for "en-US,en"
  Then the interface is English
  Given instead a new user with no usable language preference
  Then the interface is pt-BR
```

### US-001 — Upload one episode's audio
*As Rafa, I want to upload audio, so that there is something to analyse.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Accept a supported file
  Given I am signed in with an empty Library
  And I have a 2-minute pt-BR file named "ep12-final.m4a"
  When I confirm the upload
  Then an Episode is created with status `uploaded` and the title "ep12-final"
  And its duration reads 120 seconds within 1 second
  And it appears in my Library without a page reload

Scenario: Interrupted upload creates no Episode
  When the connection drops at 40 percent
  Then no Episode appears in my Library
  And I am told with code `UPLOAD_INTERRUPTED` and no parameters
```

### US-002 — Watch processing, and resume a half-finished episode
*As Rafa, I want to see progress and not lose work if I close the tab, so that a two-hour episode is not an all-or-nothing gamble.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Waiting shows numbers, never a bare spinner
  Given a 2-hour Episode of 6 chunks with status `uploaded`
  When transcription starts, then completes, then analysis completes
  Then the status is `transcribing`, then `analyzing`, then `ready`
  And each status is displayed through its `STATUS_*` label, never as the raw enum value
  And while transcribing I see code `CHUNK_PROGRESS` with the parameters { done: 4, total: 6 } and the elapsed time in seconds
  And I see an estimate derived from the remaining audio duration

Scenario: Closing the tab keeps finished chunks
  Given an Episode whose chunks 1 to 4 of 6 have transcribed
  When I close the tab and return
  Then the Episode reports `CHUNK_PROGRESS` { done: 4, total: 6 } and offers Resume
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
  Given the fixture "fixture-guardachuva-60s-ptbr.m4a" whose pt-BR script says "guardachuva" 5 times
  Then the Transcript contains the token "guardachuva" at least 4 times
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
  Given an Episode with status `ready`
  Then its Analysis records the language, the normalization, stop-word list, lemma dictionary and pipeline versions
  And re-running analysis with the same configuration yields identical counts
```

### US-005 — See the top words for one episode
*As Rafa, I want the words that dominated the episode, so that I learn something in five seconds.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Top words are ranked, with stop words excluded
  Given an Episode whose top three terms are "guardachuva" 61, "churrasco" 44 and "basicamente" 31
  Then at most 25 terms are listed by count descending
  And no listed term appears on the active pt-BR stop-word list
  And the page headline names those three terms with those three counts
  And I see the total word count, the duration and words per minute

Scenario: Inflections are grouped by default, and the merge is visible
  Given a Transcript containing "falou" 5 times, "falei" 4 times, "falar" 3 times and "falando" 2 times
  Then the list shows the term "falar" with the count 14
  And expanding it lists "falou 5 / falei 4 / falar 3 / falando 2"
  And any form grouped by the stemmer rather than the dictionary carries code `LEMMA_GROUPED_BY_STEMMER` with { term: "falar" }

Scenario: Over-merges that a stemmer would make are not made, and would be visible if they were
  Given a Transcript containing "casa" 20 times, "casar" 4 times, "com" 300 times and "comer" 9 times
  Then "casa" and "casar" are reported as two separate terms
  And "comer" is not grouped with "com"
  And every grouped count in the list can be expanded to the surface forms behind it

Scenario: An episode with no speech is reported honestly
  Given a 30-second Episode containing only silence
  Then its status is `ready` and I see code `NO_SPEECH_DETECTED` with no parameters
  And no top-words list is rendered
```

---

## E2 — Real episodes: two hours, chunked

**This epic is the main flow, not a fallback.** The show records 100–120 minutes. Everything here runs on every upload. One file arrives — the published edit — and chunking is unchanged by that (D15).

### US-040 — Upload a two-hour episode as silence-cut chunks
*As Rafa, I want a two-hour episode to just work, so that I never have to open an audio editor to use a fun app.*
Priority: **Must** · Size: **L** → split: decode and compress · silence-boundary splitting · parallel transcription and stitching

> **"Splitting never cuts a word in half" now is built.** The browser measures
> a loudness profile of the decoded audio, moves each seam to the middle of
> the nearest gap of at least 300 ms within 90 seconds of the target, and
> reports where they settled *before* uploading a byte. `episodes.chunk_starts_ms`
> holds the result; `chunksFor` reads it, falling back to the plan when it is
> absent so every episode from before this reads exactly as it did.
>
> The ordering is the load-bearing part. Recording after the upload, or
> swallowing a failure to record, leaves the server holding the planned
> boundaries while the bytes follow different ones — every timestamp after a
> seam wrong, every number still plausible. Two tests pin it, and both go red
> if the call is moved after the upload.
>
> Validated on a speech-shaped signal rather than a 0/1 fixture: the planned
> boundaries do cut mid-sentence, and every settled one lands in a pause
> (`cuts-land-in-gaps.test.ts`). Not yet exercised on a real multi-chunk
> upload — our only episode is ten minutes, which is a single chunk.

```gherkin
Scenario: A two-hour episode is chunked, compressed and uploaded
  Given a 120-minute 160 MB wav file
  When I select it
  Then I see code `UPLOAD_COST_PREVIEW` with { duration_ms: 7200000, daily_allowance_hours: 8, share_of_daily: 0.25 }
  When I confirm the upload
  Then the browser splits it into 5 or 6 chunks of 20 to 25 minutes
  And each chunk is encoded as 16 kHz mono Opus and is at most 25 MB
  And the original file is never uploaded
  And progress is reported per chunk
  And exactly one audio file was asked for, with no track-set or per-host step

Scenario: Splitting never cuts a word in half
  Given a file whose 25-minute mark falls in the middle of the word "guarda-chuva"
  When the file is split
  Then the cut is moved to the nearest silence of at least 300 milliseconds
  And the cut is within 90 seconds of the nominal chunk length
  And the fixture's full word sequence is recoverable from the chunks with no word lost and none duplicated

Scenario: A two-hour episode produces one set of counts matching its script
  Given the fixture "fixture-2h-script-ptbr.wav" whose pt-BR script says "guardachuva" 184 times across 6 chunks
  When all chunks are transcribed and stitched
  Then one Episode exists with one Transcript
  And its duration reads 120 minutes within 2 seconds
  And the count for "guardachuva" is at least 175
  And no Token appears twice

Scenario: A timestamp after a chunk join resolves to the same moment in the audio
  Given chunk 2 begins at 24:30 of the Episode
  And an occurrence of "guardachuva" 90 seconds into chunk 2
  Then the occurrence displays 26:00
  And selecting it begins playback between 25:58 and 26:00

Scenario: One chunk failing does not lose the others
  Given a 6-chunk Episode where chunk 4 fails 3 times
  Then chunks 1, 2, 3, 5 and 6 remain transcribed
  And the Episode status is `failed` with code `CHUNK_FAILED` and { chunk_index: 4, chunk_count: 6, succeeded_count: 5 }
  And Retry re-sends only chunk 4, spending no allowance on the five that succeeded
```

### US-007 — Refuse bad input with the fix attached
*As any user, I want to be told the limit and the remedy together, so that a rejection is a next step instead of a dead end.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Unsupported and unreadable files are rejected before anything is spent
  When I select "notes.docx"
  Then no bytes are uploaded and no Episode is created
  And the upload is rejected with code `UNSUPPORTED_FORMAT`
  And the parameters are { extension: ".docx", accepted: [".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac", ".webm"] }
  And the pt-BR catalogue renders it as "Formato não suportado: .docx. O Overtone aceita .mp3, .m4a, .wav, .aac, .ogg, .flac e .webm."
  And the en catalogue renders it as "Unsupported file type .docx. Overtone accepts .mp3, .m4a, .wav, .aac, .ogg, .flac and .webm."
  When I select a text file renamed "fake.mp3"
  Then the browser fails to decode it and I see code `UNREADABLE_AUDIO` with { filename: "fake.mp3" }
  And no transcription request is made

Scenario: Every accepted extension is in fact accepted
  When I upload a valid 10-second file for each of mp3, m4a, wav, aac, ogg, flac and webm
  Then 7 Episodes are created with status `uploaded`

Scenario: An episode beyond the supported length is refused with numbers
  When I select a 200-minute file
  Then the upload is rejected with code `EPISODE_TOO_LONG`
  And the parameters are { duration_minutes: 200, max_minutes: 150, allowance_hours_today: 4 }
  And the pt-BR catalogue renders it as "São 200 minutos. O Overtone aceita episódios de até 150 minutos, e a cota de hoje cobre cerca de 4 horas de áudio. Divida em dois episódios."
  And the en catalogue renders it as "This is 200 minutes. Overtone supports episodes up to 150 minutes, and today's allowance covers about 4 hours of audio. Split it into two episodes."
  And the numbers in both renderings came from the parameters, not from the sentence
```

### US-008 — Recover from a failure without re-uploading
*As any user, I want one click to retry, so that a service problem does not cost me my evening.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Transient errors are retried, then fail terminally with a cause
  Given chunk 4 of 6 being transcribed
  When the service returns HTTP 503 three times
  Then the request was retried with increasing backoff
  And the Episode status is `failed` with code `TRANSCRIPTION_SERVICE_UNAVAILABLE` and { chunk_index: 4, attempts: 3 }
  And I also see code `AUDIO_IS_SAFE` and a Retry action
  When I choose Retry
  Then the status becomes `transcribing` and I was not asked to upload or re-compress anything

Scenario: Nothing stalls indefinitely
  Given chunk 4 has been transcribing for 120 seconds
  Then the Episode status is `failed` with code `CHUNK_TIMEOUT` and { chunk_index: 4, timeout_seconds: 120 }
  And no Episode remains in a non-terminal state
```

---

## E3 — Trust: every number checkable

### US-011 — Drill from a count to its occurrences and play them
*As Rafa, I want to click any count and hear the moments behind it, so that I can catch the product lying before I post the number.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Every occurrence of a term is enumerated
  Given an Episode whose count for the Term "guardachuva" is 17
  When I select the term
  Then exactly 17 occurrences are listed
  And each shows an episode-relative timestamp and the surrounding Segment text
  And every listed Segment text contains a token matching the term

Scenario: Playback seeks to the occurrence
  Given an occurrence of "guardachuva" at 1:08:42
  When I select it
  Then playback begins between 1:08:40 and 1:08:42

Scenario: A zero count offers no drill-down
  Given an Episode whose count for "guardachuva" is 0
  Then the count renders as 0 and no occurrence list is offered
```

### US-015 — Keep filler and function words out of the way
*As Rafa, I want the top of the list to be actual subject matter, so that the headline is not "the".*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Stop words are excluded from display but never from storage
  Given a Transcript where "que" occurs 2 100 times and "guardachuva" 61 times
  Then "que" does not appear in the top-words list and "guardachuva" does
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
*As Rafa, I want "guarda chuva" counted as one thing however it is spelled, so that the bit is countable.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Spelling, separator and plural variants collapse to one Term
  Given a Transcript containing "guarda chuva" twice, "guardachuva" three times, "guarda-chuva" once and "guardachuvas" once
  When the Term "guardachuva" is counted
  Then the count is 7

Scenario: Gender and number agreement does not need a separate Term
  Given the Term "linguiça bonita"
  And a Transcript containing "a linguiça bonita" once, "as linguiças bonitas" twice and "a linguiça feia" once
  Then the count is 3
  And a leading article in a Term is ignored, so "o guardachuva", "os guardachuvas" and "guardachuva" are one Term

Scenario: Phrases are reported in their own right
  Given a Transcript containing "conspiração do Theo" 9 times
  Then "conspiração do Theo" appears in the phrase statistics with the count 9

Scenario: A phrase matches across a chunk join but never across a gap
  Given the words "guarda" and "chuva" fall either side of a chunk boundary
  When the Term "guarda chuva" is counted
  Then the count is 1
  Given instead a Transcript containing "guarda e chuva"
  Then the count for "guarda chuva" is 0
```

---

## E4 — Running jokes: the headline feature

### US-019 — Define a running joke as a tracked Topic
*As Rafa, I want to name a bit and list the words we use for it, so that the count tracks the joke and not one spelling.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: A Topic is created with alias Terms
  When I create the Topic "a parada do guardachuva" with Terms "guardachuva", "guarda chuva", "guarda-chuva" and "guardachuvão"
  Then it exists in my Library with 4 Terms
  And it applies to every current and future Episode

Scenario: A spoken form is offered its written-standard variant as an alias
  When I add the Term "tá ligado"
  Then "está ligado" is offered as an alias, already selected, with code `ALIAS_SUGGESTED_WRITTEN_VARIANT` and { term: "tá ligado", alias: "está ligado" }
  When I add the Term "né"
  Then "não é" is offered the same way
  And I can decline either without losing the Term

Scenario: Bad input and limits are rejected with specific codes
  Given a Topic named "a parada do guardachuva" exists
  When I create another named "A Parada do Guardachuva"
  Then it is rejected with code `TOPIC_NAME_TAKEN` and { name: "a parada do guardachuva" }
  When I create a Topic with no Terms
  Then it is rejected with code `TOPIC_NEEDS_A_TERM` and no parameters
  When I add a Term of 6 words
  Then it is rejected with code `TERM_TOO_MANY_WORDS` and { word_count: 6, max_words: 5 }
  When I add a 21st Term
  Then it is rejected with code `TOPIC_TERM_LIMIT` and { max_terms: 20 }
  When I create a 51st Topic
  Then it is rejected with code `LIBRARY_TOPIC_LIMIT` and { max_topics: 50 }

Scenario: A Topic created before the first episode says so instead of showing a zero
  Given a Library with 0 Episodes
  When I create the Topic "a parada do guardachuva"
  Then it is created, and I see code `TOPIC_NO_EPISODES_YET` with no parameters
  And no count, chart or "0 mentions" is rendered for it
  And it is counted on the first Episode analysed after it, with no further action from me
```

### US-020 — See running-joke counts for one episode
*As Rafa, I want each episode to report every tracked bit, so that "did we do the guardachuva thing" is answered instantly.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: Topic counts appear on the Episode and sum their Terms
  Given the Topic "a parada do guardachuva" with Terms "guardachuva", "guarda chuva" and "guarda-chuva"
  And a Transcript containing "guardachuva" 12 times, "guarda chuva" 3 times and "guarda-chuva" 2 times
  Then the Topic reports 17 mentions

Scenario: Overlapping Terms are not double-counted
  Given the Topic contains both "guardachuva" and "guardachuva thing"
  And a Transcript containing "guardachuva thing" exactly once and no other "guardachuva"
  Then the Topic reports 1 mention

Scenario: An unmentioned Topic shows zero, not nothing
  Given the Topic "a conspiração do Theo" and a Transcript with none of its Terms
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
  Then it is rejected with code `EPISODE_NUMBER_TAKEN` and { number: 12 }
  When I rename the Episode to "Cúpula do Guardachuva"
  Then the listing reads "12 · Cúpula do Guardachuva" and the source filename is still recorded
  And an empty title is rejected with code `EPISODE_TITLE_REQUIRED` and no parameters

Scenario: Episodes list newest first with Topic chips
  Given 12 ready Episodes and 2 Topics
  When I open the Series
  Then 12 rows are listed in descending episode number
  And each row shows number, title, recorded-on date, duration and status
  And each row's status is rendered through its `STATUS_*` label
  And each ready row shows a mention-count chip per Topic
  When I filter by status `ready`
  Then only ready Episodes are listed

Scenario: A Series starts at episode 1, and says so
  Given a Series whose only Episode is number 1 and is ready
  Then the row for episode 1 is listed with its counts
  And I see code `SERIES_FIRST_EPISODE` with no parameters
  And no trend, arc, comparison or per-episode chart is rendered
  And the one next action offered is to add another episode
```

### US-022 — See one running joke across every episode
*As Rafa, I want a bit's count per episode in order, so that I can see whether it is taking over the show.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Per-episode counts in episode order
  Given 6 ready Episodes numbered 1 to 6
  And the Topic "a parada do guardachuva" with counts 3, 0, 9, 14, 22, 18
  When I open the Topic
  Then the 6 counts are listed in ascending episode order
  And a total of 66 mentions across 6 episodes is reported

Scenario: Normalised rate is shown alongside raw counts
  Given a 60-minute Episode with 10 mentions and a 120-minute Episode with 12 mentions
  Then mentions per hour are reported as 10 and 6 respectively

Scenario: No trend claimed below three episodes
  Given 2 ready Episodes
  Then per-episode counts are listed and no trend direction is claimed
  And I see code `TREND_NEEDS_MORE_EPISODES` with { episode_count: 2, minimum: 3 }

Scenario: One episode is an episode, not a series — and the page is honest about it
  Given a Series with exactly 1 ready Episode and the Topic "a parada do guardachuva" counted 9 times in it
  When I open the Topic
  Then the count 9 is shown for episode 1
  And I see code `SERIES_FIRST_EPISODE` with no parameters
  And no trend, no mentions-per-hour comparison and no sparkline are rendered
  And nothing on the page implies a missing or unimported episode

Scenario: Episodes still processing are excluded, not counted as zero
  Given 5 ready Episodes and 1 with status `transcribing`
  Then 5 Episodes are included and I see code `EPISODES_STILL_PROCESSING` with { processing_count: 1 }
```

### US-042 — See the season's running-joke leaderboard
*As Rafa, I want every tracked bit ranked across the season, so that I get the one number worth screenshotting.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Topics are ranked by total mentions across the Series
  Given a Series of 12 ready Episodes
  And Topics with Series totals "né" 312, "a parada do guardachuva" 212 and "a conspiração do Theo" 46
  When I open the Series leaderboard
  Then the three Topics are listed in that order with those totals
  And each row shows how many of the 12 episodes it appeared in
  And the sum of "a parada do guardachuva" per-episode counts equals 212

Scenario: A Series with one episode says so instead of showing a season
  Given a Series with 1 ready Episode
  Then the leaderboard covers that episode only
  And every row's episodes-appeared-in reads 1 of 1, not a blank
  And I see code `SERIES_FIRST_EPISODE` and code `SERIES_NEEDS_SECOND_EPISODE`, neither taking parameters
  And no season total, trend or rank change is claimed

Scenario: A Series with no ready episodes offers the upload, not an empty leaderboard
  Given a Series with 0 ready Episodes and 3 Topics
  When I open the Series leaderboard
  Then no leaderboard, no zero rows and no placeholder chart are rendered
  And I see code `TOPIC_NO_EPISODES_YET` and exactly one action, to add an episode
```

### US-026 — Apply a new running joke to the episodes I already have
*As Rafa, I want a bit I invented in episode 12 counted across episodes 1 to 11, so that every episode Overtone has analysed answers the new question.*
Priority: **Must** · Size: **M**

> **"Already have" means episodes analysed in Overtone, from episode 1 onwards.** Nothing is imported — there is no back catalogue (see *Not for this app*) — so this story's reach grows one episode a week, and the one- and zero-episode cases below are the normal early state, not an edge case.

```gherkin
Scenario: A new Topic is applied to existing Episodes on request
  Given 12 ready Episodes
  When I create the Topic "a conspiração do Theo" and apply it to existing Episodes
  Then all 12 Episodes report a mention count for it
  And no transcription request is made and no allowance is consumed
  And a new Analysis records the new pipeline version while the Transcript id is unchanged
  And the operation completes within 10 seconds

Scenario: Episodes without a Transcript are reported as skipped
  Given an Episode with status `failed`
  When I apply a new Topic to existing Episodes
  Then it is reported as skipped with code `TOPIC_APPLY_SKIPPED_NO_TRANSCRIPT` and { episode_number: 7, status: "failed" }

Scenario: With nothing to apply it to, the offer is not made
  Given a Library with 0 ready Episodes
  When I create a Topic
  Then no "apply to existing episodes" action is offered
  And I see code `TOPIC_NO_EPISODES_YET` with no parameters
  Given instead a Library with exactly 1 ready Episode
  When I create a Topic and apply it to existing Episodes
  Then that 1 Episode reports a mention count and the result names 1 episode, not a series
```

### US-035 — One query engine behind every number
*As Rafa, I want the episode page, the leaderboard and the share page to agree, so that I never wonder which number is the real one.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: A Query counts across a Series with provenance
  Given 12 ready Episodes and the Term "guardachuva"
  When I run a Query over the whole Series
  Then a total mention count, a matching-episode count, and the earliest and latest match dates are returned
  And every match carries episode_id, start_ms and the Segment text
  When I run a Query for a Term that never occurs
  Then the total is 0, the matching-episode count is 0, and no error is raised

Scenario: Every surface agrees with the engine
  Given an Episode page reporting the Topic "a parada do guardachuva" as 17
  Then a Query for that Topic scoped to that Episode returns 17
  And the Series leaderboard's contribution from that Episode is 17
  And the Episode's public share page shows 17
```

---

> **E6 is gone and its number is retired.** It was "who talked most": per-host upload (US-037) and energy attribution (US-014). Only the final edited file is uploaded, so the signal does not exist — the epic is **deleted, not deferred**. See *Deleted from earlier drafts*.

---

## E7 — Share it

### US-039 — Share one episode's stats by public link
> **Dropped.** Built, shipped, and removed at the group's request — they did
> not want it. The route, the `share_token` column and the UI are gone
> (migration 0017). Nothing was shared when it went, so no link broke. The
> reasoning behind *how* it worked is kept in ADR 0030 in case it returns.
*As Rafa, I want a link I can paste in the group chat, so that my friends see the numbers without signing in.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Creating a link states exactly what becomes public
  Given a ready Episode
  When I create a share link
  Then an unguessable URL is produced
  And the dialog states code `SHARE_LINK_DISCLOSURE`, which takes no parameters
  And the pt-BR catalogue renders it as "Quem tiver este link vê as contagens deste episódio e os trechos por trás delas. Não vê a transcrição completa, não ouve o áudio, não vê seus outros episódios nem suas outras séries."
  And the en catalogue renders it as "Anyone with this link can see this episode's counts and the quotes behind them. They cannot read the full transcript, hear the audio, see your other episodes, or see your other series."

Scenario: An anonymous visitor sees the counts and can check them
  When someone opens the link while not signed in
  Then the headline sentence, Topic counts and top words are rendered
  And selecting a count lists its timestamped quotes
  And no audio playback is offered
  And no horizontal scrolling is required at a viewport 390 pixels wide

Scenario: A visitor with no account still reads it in their own language
  Given a share link for an Episode whose counts are 1 234 mentions
  When a visitor whose browser asks for "pt-BR" opens it
  Then the page renders in pt-BR and the count reads "1.234"
  When a visitor whose browser asks for "en-GB,en" opens it
  Then the page renders in English and the count reads "1,234"
  And the count is 1 234 in both
  And a language switch is offered on the page, needing no account
  And the owner's own interface language does not decide what a visitor reads

Scenario: The link exposes counts and quotes, and nothing else
  Given a share link for Episode 12 and another Episode 11 in the same Series
  Then the full Transcript is not reachable from the page or from any API it calls
  And the quotes returned are only the Segments that produced a rendered count
  And Episode 11 is not reachable
  And the owner's Library, other Series and email address are not disclosed
  And no audio file is reachable from any URL on the page
  When I revoke the link
  Then opening it returns not-found with code `SHARE_LINK_NOT_FOUND`, and the Episode itself is unchanged
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
  Then the chunks are uploaded, the audio is saved, and the Episode status stays `uploaded`
  And I see code `HOURLY_ALLOWANCE_EXHAUSTED`
  And the parameters are { allowance_hours: 2, minutes_until_reset: 34 }
  And the pt-BR catalogue renders it as "Você já usou as 2 horas de transcrição desta hora. Tente de novo em 34 minutos. Seu áudio está salvo."
  And the en catalogue renders it as "You've used this hour's 2 hours of transcription. Try again in 34 minutes. Your audio is saved."
  And an Analyse action is offered for later
  Given instead that 8 audio-hours have been transcribed today
  Then I see code `DAILY_ALLOWANCE_EXHAUSTED` with { allowance_hours: 8, reset_at_utc: "00:00", hours_until_reset: 6 }

Scenario: Remaining allowance is visible before I commit
  Given 6 of today's 8 audio-hours are used
  When I open the upload screen
  Then I see code `ALLOWANCE_REMAINING` with { remaining_ms: 7200000, allowance_hours: 8, whole_episodes_remaining: 1 }

Scenario: The request rate limit is absorbed, not surfaced
  Given a 6-chunk Episode
  When the service returns a rate-limit response on chunk 4
  Then chunk 4 is retried after a delay, the status stays `transcribing`, and no message of any code is shown

Scenario: Storage refuses with a specific remedy
  Given stored audio totals 1 GB
  When I upload an Episode needing 22 MB
  Then it is refused with code `STORAGE_FULL`
  And the parameters are { used_bytes: 1073741824, limit_bytes: 1073741824, needed_bytes: 23068672 }
  And both renderings name the space this upload needed, and the remedy: wait for the episodes still transcribing, which frees their audio as it goes (ADR 0031)
  And the byte sizes are rendered by the locale formatter, "1 GB" in both and "22 MB" in both
```

> **No backfill story, and deliberately none.** The stakeholder chose **only new episodes from now on**, so there is nothing to import. A weekly show never meets the daily allowance as a wall, and the 1 GB ceiling is nine months away (D12, US-034). See *Not for this app*.

---

## E9 — Making the number land, and cleaning up

### US-046 — Switch the interface language without moving a single number
*As Rafa, I want to flip the interface to English and back, so that the app reads in my language and nothing about my show changes.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Switching changes every string on screen, and only the strings
  Given I am reading an Episode page in pt-BR
  When I switch the interface language to English
  Then every visible string is the `en` rendering of its code
  And no visible string is still pt-BR
  And the status label, the empty states, the chips and any warning banner switched with it

Scenario: The choice survives the session
  Given I switched the interface to English
  When I sign out, sign in again on another device, and open my Library
  Then the interface is English

Scenario: A count never changes because the interface language changed
  Given an Episode reporting the Topic "a parada do guardachuva" 17 times, 24312 total words and 213 words per minute
  When I switch the interface language to English and back to pt-BR
  Then the Topic still reports 17 mentions, the same total words and the same words per minute
  And the Transcript, every Segment, every Token, every lemma and every Analysis are byte-identical
  And the Analysis still records the analysis language "pt" and the pt-BR normalization, stop-word list and lemma dictionary versions
  And the only difference between the two renderings is formatting: "24.312" in pt-BR, "24,312" in `en`

Scenario: The interface language never reaches the pipeline
  Given my interface is English
  When I upload an Episode and it is analysed
  Then every transcription request carried language "pt"
  And no transcription request, no Analysis row and no stored Token carries an interface locale
  And the English interface states code `ANALYSIS_ALWAYS_PTBR`, so I am not told the analysis followed my interface
```

### US-027 — The episode page, and what it looks like when there is nothing yet
*As Rafa, I want one page that tells me what this episode became, so that I do not assemble the story from widgets.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: The page renders a fixed, ordered hierarchy
  Given a ready Episode
  Then it renders in this order: any warning banner, headline sentence, running-joke counts, top words, link to the transcript
  And one line carries code `COUNTS_DESCRIBE_PUBLISHED_EDIT`, stating that the counts describe the published episode, as transcribed
  And a warning banner, where there is one, carries `TRANSCRIPT_QUALITY_POOR` or `AUDIO_MAY_NOT_BE_PTBR`
  And the headline and top three terms are visible without scrolling at 1280 by 800
  And every rendered count is actionable and opens its occurrence list
  Given instead an Episode with status `transcribing`
  Then the chunk progress from US-002 is shown and no empty statistics sections are rendered

Scenario: Empty states offer exactly one thing to do
  Given a signed-in user with 0 Episodes
  Then exactly one primary action is offered, to add an episode
  And I see code `LIBRARY_EMPTY` with { accepted: [".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac", ".webm"], max_minutes: 150 }
  And both renderings state that Overtone analyses Brazilian Portuguese audio whatever language the interface is in (D16)
  And no empty charts or placeholder widgets are rendered
  Given instead a ready Episode and 0 Topics
  Then the running-jokes area shows code `NO_TOPICS_YET` with { suggested_term: "guardachuva" } rather than an empty chart

Scenario: The first episode is a complete page, not a page with holes
  Given a ready Episode that is episode 1 of its Series
  Then the headline, running-joke counts and top words render in full
  And I see code `SERIES_FIRST_EPISODE`, which takes no parameters
  And the pt-BR catalogue renders it as "Este é o seu primeiro episódio. Ainda não há nada para comparar."
  And the en catalogue renders it as "This is your first episode. There is nothing to compare yet."
  And no cross-episode section, trend, arc or "compared to last episode" delta is rendered
  And nothing on the page implies an episode is missing, unimported or still to be added
```

### US-049 — Fix a line the transcriber got wrong
*As any of us, I want to correct a line I know is wrong, so that the numbers are about what we actually said.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: A correction moves the counts, not just the words on screen
  Given a line transcribed as "Tô mostrando a saia agora"
  And the Episode counts `mostrar` once
  When I click the line and type "Tô começando a sair de casa agora"
  Then the Episode counts `mostrar` zero times and `começar` once
  And the Transcript, Segments and search index all read the corrected words
  And no transcription allowance is spent

Scenario: The original is kept
  Given a corrected line
  Then `chunk_transcripts.words` still holds exactly what the transcriber said
  And clearing the correction puts every count back where it was
```

> **Shipped.** Corrections are an overlay in `episode_corrections`, addressed
> by time rather than word position — a position shifts as soon as an earlier
> correction changes the word count, and word start times run backwards 4.5%
> of the time because people talk over each other.
>
> Word timings inside a corrected line are **interpolated**: the typed words
> are spread evenly across the line's own span. The line's start and end stay
> exact, so clicking a count still lands on the right line; only sub-second
> position within a corrected line is approximate. Nobody can know where
> inside a second a word that was never heard would have fallen.

### US-050 — The library is not capped by the size of the audio
*As any of us, I want to keep uploading episodes indefinitely, so that the series comparison has a series to compare.*
Priority: **Must** · Size: **S**

```gherkin
Scenario: A chunk's audio is freed as soon as it is transcribed
  Given a 13-chunk Episode with 4 chunks transcribed
  When chunk 5 is transcribed
  Then chunk 5's audio is removed from storage
  And the 8 untranscribed chunks still have theirs

Scenario: A failed chunk keeps its audio
  Given a chunk whose transcription failed with `PROVIDER_UNAVAILABLE`
  Then its audio is still in storage
  And the retry transcribes it without a re-upload

Scenario: Three episodes in one day do not collide
  Given 3 Episodes of 2h06m uploaded within the same hour
  Then storage never holds more than one episode's untranscribed remainder
  And no upload is refused with `STORAGE_FULL`
```

> **Shipped.** `freedAudio` decides what an advance made dead weight: a
> `transcribed` outcome frees that chunk, `ready` sweeps the episode as a
> backstop, and `failed`/`waiting` free nothing because both expect a retry.
>
> Waiting for the whole episode was the bug. Pacing drains a 2h06m episode's
> thirteen chunks over an hour or more, so three uploads in a day — the daily
> cap — would have held ~729 MB at once on a 1 GB tier. See ADR 0031, which
> supersedes the retention policy in ADR 0013.

### US-025 — Delete an episode permanently
*As any user, I want deletion to be real, so that I trust the app with recordings of my friends.*
Priority: **Must** · Size: **M**

```gherkin
Scenario: Deletion names what it destroys, then destroys it
  Given a ready Episode titled "Cúpula do Guardachuva"
  When I choose Delete
  Then the confirmation carries code `DELETE_EPISODE_CONFIRMATION` with { title: "Cúpula do Guardachuva" }
  And both renderings name the title and state that the audio, transcript and all statistics are destroyed permanently
  When I confirm
  Then the Episode disappears from the Series immediately
  And its Transcript, Segments, Tokens and Analyses are not retrievable by any request
  And any share link for it returns not-found
  And all its chunks are purged from storage within 24 hours

Scenario: Deletion updates Series-wide counts
  Given the Topic "a parada do guardachuva" reported 212 mentions across 12 Episodes
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
| US-034 | Purge an episode's audio, keep its stats | Should | S | The pressure valve for the 1 GB ceiling (D12). It waits because a weekly show takes about nine months to fill 1 GB — nothing imports a back catalogue any more |
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
| **Natural-language assistant** ("how many times did we ever mention guardachuvas") | The north star, and cheap *later* precisely because US-035 exists. Not now: it needs an eval harness and a prompt-injection story on top of a pipeline nobody has used |
| Machine-discovered topic clustering | A podcast group already knows its bits by name (ADR 0006). Clusters are unstable across episodes, which would make the Series view — the whole product — meaningless |
| **Who talks most, in any form** | There is one edited file, so no per-host signal exists, and the free stack has no diarisation. **Removed from the product, not deferred.** A confidently wrong speaker label would be worse than none, and an estimate is the only thing we could build |
| Reconstructing the unedited conversation | We are given the published edit. Counts describe what listeners heard (D15) — the more meaningful number for a podcast, and the only one we have |
| Fuzzy or phonetic matching of mishearings | Trades invisible false negatives for invisible false positives with no eval set (D9) |
| Sentiment, emotion, summarisation, "best clip" detection | Unfalsifiable. Every claim in this app must be a count a test can assert |
| **Importing a back catalogue** (was US-044, id retired) | **Stakeholder answer: only new episodes from now on, so there is nothing to import.** The Series therefore starts at episode 1 and grows about one episode a week — which is why the zero- and one-episode states in US-019, US-022, US-026, US-027, US-038 and US-042 carry real weight, and why neither the daily allowance nor the 1 GB ceiling is a near-term wall any more |
| Analysis in any language other than pt-BR | One pipeline per language, not one setting: stop-word list, lemma dictionary, clitic rules, compound handling, normalization. US-013 warns honestly instead. **The bilingual interface (D16) is a different axis and changes nothing in this row** — an English reader is still analysing pt-BR speech |
| Translating or language-tagging code-switched English words | `deploy`, `bug`, `hype` are counted as spelled, as ordinary Tokens (D14). Inflections and alternate spellings are handled by a Term's alias set, which the user controls and can see |
| Video files, live transcription, bots joining calls | A different product |
| Teams, shared libraries, roles, per-episode permissions | Each friend has their own Library; sharing is a link. An authorisation model would slow every story for a group of four |
| A background worker, a job queue, or a cron scheduler | ADR 0010 deleted all three. With one new episode a week there is nothing to queue: the user is the scheduler |
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
8. **The interface locale never crosses into the pipeline, and no layer below the presenter holds a sentence.** Messages travel as a code plus parameters; only the presenter resolves them against a catalogue (D16, US-045). Asserted by US-046: switching the interface changes every string and no count. A locale that reaches tokenising, lemmatising or counting would make the same episode report two different numbers to two readers — the one bug this design exists to make impossible.

---

## Message codes

**This table is the contract.** Every code becomes a member of one TypeScript union, every parameter list becomes its payload type, and **both catalogues — `pt-BR` and `en` — must render every code here and nothing else** (US-045). A scenario asserts a code and its parameters; the sentences live in the catalogues, never in a test and never below the presenter (D16).

| Code | Parameters | Raised by |
|---|---|---|
| **Input, upload and format** | | |
| `UNSUPPORTED_FORMAT` | `extension`, `accepted[]` | US-007 |
| `UNREADABLE_AUDIO` | `filename` | US-007 |
| `EPISODE_TOO_LONG` | `duration_minutes`, `max_minutes`, `allowance_hours_today` | US-007 |
| `UPLOAD_COST_PREVIEW` | `duration_ms`, `daily_allowance_hours`, `share_of_daily` | US-040 |
| `UPLOAD_INTERRUPTED` | — | US-001 |
| **Pipeline, progress and failure** | | |
| `CHUNK_PROGRESS` | `done`, `total` | US-002 |
| `CHUNK_FAILED` | `chunk_index`, `chunk_count`, `succeeded_count` | US-040 |
| `CHUNK_TIMEOUT` | `chunk_index`, `timeout_seconds` | US-008 |
| `TRANSCRIPTION_SERVICE_UNAVAILABLE` | `chunk_index`, `attempts` | US-008 |
| `AUDIO_IS_SAFE` | — | US-008, US-043 |
| `NO_SPEECH_DETECTED` | — | US-005 |
| `LEMMA_GROUPED_BY_STEMMER` | `term` | US-005 |
| **Allowance and storage** | | |
| `ALLOWANCE_REMAINING` | `remaining_ms`, `allowance_hours`, `whole_episodes_remaining` | US-043 |
| `HOURLY_ALLOWANCE_EXHAUSTED` | `allowance_hours`, `minutes_until_reset` | US-043 |
| `DAILY_ALLOWANCE_EXHAUSTED` | `allowance_hours`, `reset_at_utc`, `hours_until_reset` | US-043 |
| `STORAGE_FULL` | `used_bytes`, `limit_bytes`, `needed_bytes` | US-043 |
| **Topics and Terms** | | |
| `TOPIC_NAME_TAKEN` | `name` | US-019 |
| `TOPIC_NEEDS_A_TERM` | — | US-019 |
| `TERM_TOO_MANY_WORDS` | `word_count`, `max_words` | US-019 |
| `TOPIC_TERM_LIMIT` | `max_terms` | US-019 |
| `LIBRARY_TOPIC_LIMIT` | `max_topics` | US-019 |
| `ALIAS_SUGGESTED_WRITTEN_VARIANT` | `term`, `alias` | US-019 |
| `TOPIC_APPLY_SKIPPED_NO_TRANSCRIPT` | `episode_number`, `status` | US-026 |
| **Series and Episodes** | | |
| `EPISODE_NUMBER_TAKEN` | `number` | US-038 |
| `EPISODE_TITLE_REQUIRED` | — | US-038 |
| `EPISODES_STILL_PROCESSING` | `processing_count` | US-022 |
| `DELETE_EPISODE_CONFIRMATION` | `title` | US-025 |
| **Empty and first-episode states** — load-bearing, because the Series starts at episode 1 and nothing is imported | | |
| `LIBRARY_EMPTY` | `accepted[]`, `max_minutes` | US-027 |
| `NO_TOPICS_YET` | `suggested_term` | US-027 |
| `TOPIC_NO_EPISODES_YET` | — | US-019, US-026, US-042 |
| `SERIES_FIRST_EPISODE` | — | US-022, US-027, US-038, US-042 |
| `SERIES_NEEDS_SECOND_EPISODE` | — | US-042 |
| `TREND_NEEDS_MORE_EPISODES` | `episode_count`, `minimum` | US-022 |
| **Honesty, warnings and disclosure** | | |
| `COUNTS_DESCRIBE_PUBLISHED_EDIT` | — | US-027, US-039 |
| `ANALYSIS_ALWAYS_PTBR` | — | US-046 |
| `TRANSCRIPT_QUALITY_POOR` | `quality_score`, `threshold` | US-012 |
| `AUDIO_MAY_NOT_BE_PTBR` | `quality_score`, `detected_language` | US-013 |
| `SHARE_LINK_DISCLOSURE` | — | US-039 |
| `SHARE_LINK_NOT_FOUND` | — | US-039 |
| **Status labels** — the enum value is the contract, the label is text | | |
| `STATUS_UPLOADED` · `STATUS_TRANSCRIBING` · `STATUS_ANALYZING` · `STATUS_READY` · `STATUS_FAILED` · `STATUS_DELETING` | — | US-002, US-038 |

**45 codes**, of which 6 are status labels. Rules the lint enforces (US-045): a code is referenced by at least one scenario before it is added; both catalogues are complete; no component, use case, domain object or infrastructure adapter contains a user-facing sentence; and every number inside a rendering arrives as a parameter through the locale formatter, never baked into the sentence.
