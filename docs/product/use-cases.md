# Overtone — Use Case Catalogue

**Actors:** `Rafa` = the host who uploads (MVP persona) · `Mel` = co-host, mostly reads share links · `Any` = any signed-in user · `Viewer` = anyone with a share link, not signed in · `Sys` = background worker.

**Release:** `MVP` = first shippable release · `Next` = straight after · `Later` = only on evidence someone is blocked.

**The show is recorded in Brazilian Portuguese, and an episode arrives as one already-edited file** (D14, D15). Both facts are properties of every row below, not use cases of their own. **The interface is bilingual — pt-BR and English** (D16), which *is* a use case (UC-34) because the reader chooses it; the **analysis** is pt-BR either way.

| ID | Use case | Actor | Trigger | Value delivered | Release |
|---|---|---|---|---|---|
| UC-01 | Upload one episode's audio | Rafa | Just finished recording episode 12 | Audio enters the Library and processing starts with no further action | **MVP** |
| UC-03 | Upload a two-hour episode | Rafa | Every episode they record | The browser splits it on silence into ~22-minute chunks, compresses each to 16 kHz mono Opus, and the chunks are transcribed in parallel and stitched. **The normal path, not a workaround** | **MVP** |
| UC-04 | Watch processing progress | Any | Upload accepted | Removes dead-time anxiety; says whether to wait or leave | **MVP** |
| UC-05 | See one episode's word statistics | Rafa | Processing completes | "What did this episode actually turn into?" in one glance | **MVP** |
| UC-06 | Drill from any count to every timestamped occurrence | Rafa | Clicks a number | Makes every statistic checkable — the difference between fun and fabricated | **MVP** |
| UC-07 | Define a running joke as a tracked Topic | Rafa | Knows the bit by name: "a parada do guardachuva" | Turns the group's private vocabulary into a real metric. **The headline feature.** | **MVP** |
| UC-08 | See running-joke counts for one episode | Rafa | Opens an episode | "Did we do the bit?" answered immediately | **MVP** |
| UC-09 | Group episodes into a Series with numbers | Rafa | Second episode uploaded | Episodes become a show instead of a pile of files | **MVP** |
| UC-10 | See a running joke's count across every episode | Rafa | "A parada do guardachuva está piorando?" | **The actual product.** No single episode can answer this | **MVP** |
| UC-11 | See the season's running-joke leaderboard | Rafa | End of a season, or any idle Tuesday | *"a gente falou 'né' 312 vezes nessa temporada"* — the screenshot-worthy number | **MVP** |
| UC-12 | Apply a new running joke to the episodes already analysed | Rafa | Invents a Topic in episode 12 he wishes he'd tracked from episode 1 | Every episode Overtone has analysed — episode 1 onwards — gains new answers with no re-transcription | **MVP** |
| UC-14 | Share one episode's counts and quotes by public link | Rafa → Mel / Viewer | Wants to post it in the group chat | Distribution. A pretty public stats page is something a podcast would actually post. **Settled: counts and quotes, never the full transcript** | **MVP** |
| UC-15 | Open a shared stats page on a phone, not signed in | Viewer | Taps a link in a group chat | Zero-friction consumption; no account required to look | **MVP** |
| UC-16 | Sign in with a magic link and see only my own Library | Any | Returns to the app | Each friend gets their own library without passwords or admin | **MVP** |
| UC-34 | Read the interface in Portuguese or English | Any / Viewer | Shows the app to a friend who reads English | Both languages, switchable and persisted, with no effect on a single count (D16) | **MVP** |
| UC-17 | Browse the Series and its episodes | Rafa | Returns after a week | Finds the episode; sees the show as an accumulating thing | **MVP** |
| UC-18 | Recover from an unsupported file | Any | Drops a `.mov` or a `.pdf` | A specific fix, before any bytes or daily quota are spent | **MVP** |
| UC-19 | Be refused a file past 150 minutes, with numbers | Any | A 3-hour live special | Knows the real limit and that it is the daily allowance, not the file | **MVP** |
| UC-20 | Recover from a processing failure | Any / Sys | Transcription errors out | Terminal `failed` state with a one-click retry, never silent limbo | **MVP** |
| UC-21 | Be told which allowance ran out and when it lifts | Any / Sys | Second two-hour episode in the same hour | "Try again in 34 minutes", in hours, not a mysterious failure | **MVP** |
| UC-22 | Delete an episode and everything derived from it | Any | Mistake, or reclaiming storage | Control over their own audio; also the storage-pressure valve | **MVP** |
| UC-23 | Compare two episodes side by side | Rafa | "Was last week worse?" | Change detection without manual diffing | **Next** |
| UC-24 | Read the transcript with timestamps | Rafa | Writing show notes, or doubts a quote | Reuse of work already paid for in processing time | **Next** |
| UC-25 | See filler-word and pace stats | Rafa / Mel | Vanity | "Mel says 'like' 4.2 times a minute" is exactly the fun this app is for | **Next** |
| UC-26 | Be warned when audio is too poor to trust | Rafa | They recorded an episode in a car | Prevents presenting garbage as a finding | **Next** |
| UC-27 | Say when an episode is not in Brazilian Portuguese | Any | Uploads an English episode | A pt-BR pipeline run over English audio produces confident nonsense. An honest warning beats a silently-wrong word count | **Next** |
| UC-28 | Skip a duplicate upload | Any | Uploads the same track twice | Protects the shared daily audio budget from being burned twice | **Next** |
| UC-29 | Purge an episode's audio, keep its stats | Any | 1 GB storage is nearly full | Keeps the Series analytically intact when storage runs out | **Next** |
| UC-30 | Delete my account and all my data | Any | Leaves the group | Leaving is as easy as joining | **Next** |
| UC-31 | Compare this season to the last | Rafa | Season 2 finale | The long-horizon version of UC-10 | **Later** |
| UC-32 | Ask a question in natural language across the Series | Rafa | *"Quantas vezes a gente já falou de guardachuva?"* | The north star. Cheap only if UC-06/UC-10 are built on a token-level index | **Later** |

---

## Scope boundaries

- **UC-16 → UC-01 → UC-05 is the walking skeleton.** Sign-in is in it because tenancy retrofits badly, and because "friends can use it" is the whole premise.
- **UC-10 and UC-11 are not enrichment, they are the product.** A podcast with one analysed episode is nearly useless. Earlier drafts put cross-episode work in month three; that was the single biggest mis-scope.
- **One file per episode, and it is the published edit.** There is no track-set concept and no second upload path (D15). Counts therefore describe the episode listeners heard — the more meaningful number for a podcast, and one UC-05, UC-14 and UC-25 must each say out loud rather than imply.
- **Every rule in the counting pipeline is a pt-BR rule, not a locale setting** (D2–D6, D14). Diacritics are never stripped, enclitic pronouns split off their verbs, lemma grouping is load-bearing rather than cosmetic, and a watchlist carries both spoken and written spellings (`pra`/`para`) as aliases of one Term. UC-07 is where the user pays for all of it, in one form, once.
- **UC-06 is non-negotiable in MVP.** Without drill-down every count is an unfalsifiable claim, and a joke nobody can verify is not funny.
- **UC-21 exists because the allowance is shared and small.** Two audio-hours per hour and eight per day across all users is about one two-hour episode an hour and four a day — ample for a weekly show, which is now the only case: **nothing is imported, so the Series starts at episode 1** (see *Dropped*). The ceilings must still be stated in hours and gigabytes, up front.
- **The Series grows one episode at a time, so the empty and single-episode states are the first thing anyone sees.** UC-09, UC-10 and UC-11 are the product, and for the first week or two they have one episode to work with. They must say "this is your first episode, there is nothing to compare yet" honestly, and render no trend, no arc and no placeholder chart.
- **UC-34 is presentation only.** The interface language changes every string and no number. The analysis language is `pt` whatever the reader chose (D16), and asserting a user-facing sentence in a test is no longer allowed — tests assert a message code and its parameters.

## Deliberately dropped from earlier drafts

**Back-catalogue import (was UC-33).** The stakeholder chose **only new episodes from now on**, so there is nothing to import — the Series starts at episode 1 and grows weekly. Nothing in the app assumes a pre-existing library.

Bulk archive import · CRM/dialer ingest · per-speaker coaching metrics · consent and notice flows · CSV export · retention policies · teams, roles and shared libraries · PII redaction · billing and quotas. Each belonged to a product with a business. This one has friends.

## Removed because there are no per-host tracks

| Was | One-line reason |
|---|---|
| **UC-02** Upload per-host tracks alongside the master | They upload only the final edited file, so no per-host signal exists to upload (D15). |
| **UC-13** See who talked most, per episode | Nothing can be attributed to a person from one mixed file, and the free stack has no diarisation. **Removed from the product, not deferred** — there is no *Later* lane for it. |
| Per-host term counts, talk-time percentages, host renaming | All derived from UC-13. Gone with it. |
