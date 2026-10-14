# Overtone — User Journeys

Five journeys. J1–J3 are the product; J4–J5 are the ways it has to fail well. The show is recorded **in Brazilian Portuguese** and arrives as **one already-edited file** per episode; episodes run **100–120 minutes** — that is the normal case throughout. **Make-or-break moments are marked 🔥** — they get disproportionate design and test attention.

Actors: **Rafa** (host, uploads) and **Mel** (co-host, mostly opens links). See `personas.md`.

**The sentences quoted below are illustrations, not assertions.** The interface is bilingual (D16), so every message is a **code plus parameters** rendered by a pt-BR or an English catalogue; the codes are listed in `backlog.md`. Journeys quote the pt-BR-equivalent English wording because it reads faster here — no test may assert these strings.

---

## J1 — "We just recorded episode 12. What do we do?" 🔥

Sunday night. Rafa has just finished the edit. The episode is **1 hour 54 minutes**, which is normal for them, and it is **one file** — the version that gets published. He has never used Overtone.

| Step | User action | System response | What he needs | Risk |
|---|---|---|---|---|
| 1 | Enters his email | Magic link arrives; one click signs him in. No password, no workspace setup, no team invite | To be inside the app in under 30 seconds | A sign-up funnel for a free app a friend mentioned loses him at step one |
| 2 | Lands on an empty Library | One affordance: a drop zone reading "Drop your finished episode. Episodes up to 2.5 hours are fine. Overtone analyses Brazilian Portuguese." | To not have to learn a concept first | An empty dashboard of widgets reads as broken. Stating the two-hour support *before* he picks a file is what stops him assuming it won't work |
| 3 | Drops the edited file | Accepted as **one Episode**. One file, one drop zone, no track-set concept, nothing to name | To drag one thing and be done | Any flow that asks which file is which invents a concept the user does not have (D15) |
| 4 🔥 | Sees what it will cost | "Episode 12 is 1h54m. That is 1h54m of today's 8-hour transcription budget — about a quarter." | Honesty about a shared limit, before he commits | Discovering the allowance after the fact feels like a bait and switch |
| 5 | Confirms | The browser splits the file on silence into 6 chunks of about 22 minutes, compresses each to 16 kHz mono Opus (≈4.5 MB each, 27 MB total), and uploads them with per-chunk progress. Takes a couple of minutes | To not open an audio editor, ever | Cutting a chunk mid-word loses or duplicates a word, and the user can never see why a count is off by one |
| 6 | Waits | Chunks transcribe in parallel; the page reads "5 of 6 chunks transcribed" with elapsed time. Under a minute | A number, not a spinner | A spinner with no count is the single biggest abandonment point. Never ship one |
| 7 🔥 | Reads the result | One episode, one set of stats: headline sentence naming the top three terms with counts, total words, words per minute. Counts are lemma-grouped, and each one expands to the surface forms behind it (`falar 14` → `falou 5 / falei 4 / falar 3 / falando 2`) | To recognise his own show in the output within 5 seconds | If the headline is `tipo, né, assim`, it looks like a toy — the pt-BR stop-word list must be aggressive by default. And a count with no surface-form breakdown hides an over-merge (`comer` folded into `com`) that he would otherwise have caught (D4) |
| 8 🔥 | Clicks a count at 1:47:30 | Occurrences listed with timestamps and quotes; playback seeks to 1:47:30 of the episode, not of chunk 5 | To catch the product lying once, and find it isn't | A chunk offset applied wrong — or twice — sends every quote in the last 90 minutes to the wrong moment, and it fails silently |
| 9 | Prompted: "Track a running joke?" | Inline suggestion seeded from his own top lemmas; one click creates the Topic `a parada do guardachuva` with aliases `guardachuva, guarda chuva, guarda-chuva, guardachuvão` | The next action handed to him, not a blank taxonomy form | Asking him to invent a watchlist from nothing stalls everything that follows |

**Success:** in one sitting of about ten minutes, Rafa has a two-hour episode analysed, has verified one count against the audio, and has created one running joke — without paying, installing, or reading anything.

**If he closes the tab mid-way:** finished chunks are kept. On return the Episode reads "4 of 6 chunks transcribed" with a Resume action that sends only the missing chunks. Nothing is re-uploaded, nothing is transcribed twice, and no allowance is spent twice.

---

## J2 — The Series view: "is the guardachuva thing getting worse?" 🔥

Six weeks later. Twelve episodes in the Series, four running jokes tracked. **This is the retention journey and the reason the app exists.** It must pay off in under 60 seconds.

**Twelve episodes took twelve weeks of recording, because nothing is imported.** There is no back catalogue — the Series starts at episode 1 and grows one episode a week. So **J2 does not exist yet for a new user, and the honest version of this page for episodes 1 and 2 is the one most people will see first:** full stats for the episode, `SERIES_FIRST_EPISODE` ("this is your first episode, there is nothing to compare yet"), no trend below three episodes, and no placeholder chart pretending a series is there. Getting that state right is what earns the right to this journey.

| Step | User action | System response | What he needs | Risk |
|---|---|---|---|---|
| 1 | Opens the Series | Episodes listed newest-first with number, date, duration, and a chip per running joke — **counts on the list page** | His answer before clicking anything | A list of filenames forces a click-hunt and the ritual dies |
| 2 🔥 | Opens the season leaderboard | Every tracked Topic ranked by total mentions across 12 episodes: `né 312 · a parada do guardachuva 212 · a conspiração do Theo 46`, plus episodes-appeared-in | **The screenshot moment.** One number that is funny and true | A per-episode-only product has no payoff here, and 12 episodes of per-episode stats is 12 toys, not one product |
| 3 🔥 | Opens the Topic `a parada do guardachuva` | Count per episode in order: `3 → 0 → 9 → 14 → 22 → 18 …` with mentions-per-hour beside raw counts | To see an *arc*, not a total | Raw counts across unequal episode lengths mislead. Always show the normalised rate too |
| 4 | Reads the trend | Plain words: "up from 3 to 18 over 12 episodes". No trend claimed below 3 episodes | Vindication | Drawing a trend line through two points invents a finding |
| 5 | Invents a new bit mid-season | Creates Topic `a conspiração do Theo`, offered "Apply to all 12 episodes" | The past to become answerable | If Topics only apply going forward, the Series stops compounding and the product is back to being per-episode |
| 6 | Confirms | Re-analysis runs from stored transcripts — no re-transcription, no daily budget spent — and finishes in seconds | It to be instant and free | Re-transcribing here would burn the whole day's budget on a Topic edit. Transcripts must be stored and re-analysable |

**Success:** a running joke invented in episode 12 is counted across episodes 1–11 in seconds, for free, and the arc is readable at a glance.

**One thing the counts are not:** the file is the published edit, so `né 312` is how often it survived the cut, not how often it was said in the room (D15). The Series page says so in one line — it is the more interesting number anyway, and claiming the other one would be a lie a listener could not check.

---

## J3 — Posting it in the group chat 🔥

Rafa wants the group to see episode 12's numbers. Mel is on a phone, on a bus, not signed in.

| Step | User action | System response | What they need | Risk |
|---|---|---|---|---|
| 1 | Clicks Share on the episode | An unguessable link is created; a dialog states exactly what is public: "Anyone with this link can see this episode's counts and the quotes behind them. They cannot read the full transcript, hear the audio, see your other episodes, or see your other Series. [Revoke]" | To know precisely what he is exposing before he pastes it anywhere | Vague sharing language on a page containing quotes from a private conversation is how a fun app becomes a regret |
| 2 | Pastes it in the chat | Link preview shows the show name, episode number and the headline stat | Something that looks good unfurled in a chat app | A bare URL with no preview does not get clicked |
| 3 🔥 | Mel taps it on a phone | Public stats page renders with no sign-in: headline sentence, running-joke leaderboard for the episode, top words. No transcript. Readable at 390 px with no horizontal scroll | To get the joke in 10 seconds without an account | A sign-in wall here kills the only distribution mechanism the app has |
| 4 | Mel taps a count | The same drill-down as the owner sees: timestamps and the quote Segments, no audio playback and no way to page through the rest of the transcript | The number to be checkable by her too | A public page whose numbers can't be inspected is a marketing claim, not a stat |
| 5 | Mel wants her own | One line at the bottom: "Analyse your own show" → magic-link sign-in → her own empty Library | A path in that doesn't touch Rafa's data | Dropping her into Rafa's Library, or asking her to "join a workspace", is the wrong model: friends get their own libraries |
| 6 | Rafa revokes it later | The link 404s; the episode is untouched | Deletion that is real | A revoked link that still resolves from a cache is a broken promise |

**Success:** Rafa pastes one link, three friends see the numbers on their phones without signing in, and one of them signs up.

---

## J4 — The limits they will actually hit

Chunking means length is no longer the problem. The real walls are the shared allowance and the 1 GB of storage — and both must be stated in the units the user thinks in.

| Step | Trigger | System response | What he needs | Risk |
|---|---|---|---|---|
| 1 | A 3-hour live special | Refused before upload with numbers: "This is 180 minutes. Overtone supports episodes up to 150 minutes, and today's allowance covers about 4 hours of audio. Split it into two episodes." | The real limit and a next step | "File too large" is wrong here and would send him looking for a compressor he doesn't need |
| 2 🔥 | A second two-hour episode in the same hour | Chunks upload, audio is saved, Episode stays `uploaded`: "You've used this hour's 2 hours of transcription. Try again in 34 minutes. Your audio is saved. [Analyse]" | To know nothing was lost and when to come back | A generic failure here reads as "the app is broken". The limit is a fact of the free tier and must be stated as one, with a time |
| 3 | A fifth episode in one day | "You've used today's 8 hours of transcription. It resets at 00:00 UTC, in 6 hours." | The same honesty at the daily scale | — |
| 4 | Storage reaches 1 GB, about nine months in | `STORAGE_FULL`: "Storage is full (1 GB of 1 GB). Delete an episode, or purge an old episode's audio and keep its stats." | The remedy named, with the stats-preserving option | A full disk that manifests as a failed transcription is undiagnosable from outside |

**Success:** no limit is ever discovered by failure. Every ceiling is quoted in hours or gigabytes, before the user commits, with the remedy attached.

**The wall that is gone.** Earlier drafts had a two-week, 50-episode backfill here — the only thing in the product that could actually exhaust the daily allowance or the storage tier. **The stakeholder chose only new episodes from now on, so there is nothing to import** and both ceilings recede: one weekly episode spends a quarter of one day's allowance, and 1 GB is about nine months of recording away.

---

## J5 — When one chunk breaks

| Step | Trigger | System response | Risk |
|---|---|---|---|
| 1 | A chunk errors out, or the 20-requests-per-minute limit is hit | Retried 3× with backoff; status stays `transcribing`; nothing is shown to the user | Surfacing a rate-limit as a failure makes a six-chunk episode look broken when it only needed to wait three seconds |
| 2 | Retries exhausted on chunk 4 | Chunks 1, 2, 3, 5 and 6 stay transcribed. Status `failed`, naming chunk 4, with "Your audio is safe. [Retry]" | Throwing away five good chunks because one failed spends the allowance twice and wastes ten minutes of the user's evening |
| 3 🔥 | Rafa clicks Retry | Only chunk 4 is re-sent, from the stored chunk; no re-upload, no re-compression, no allowance spent on the other five | Re-running the whole episode after one transient 503 is the difference between a 10-second fix and a 2-hour one |
| 4 | A chunk hangs | A 120-second per-chunk ceiling forces `failed` with a timeout reason | An episode stuck on `transcribing` forever is worse than a visible failure |

**Success:** every failure says what broke, whether the audio survived, and what it will cost to retry. Nothing ever sits in a non-terminal state, and no success is ever thrown away to recover from a neighbour's failure.
