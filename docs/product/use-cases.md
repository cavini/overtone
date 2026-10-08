# Overtone — Use Case Catalogue

**Actors:** `Rafa` = the host who uploads (MVP persona) · `Mel` = co-host, mostly reads share links · `Any` = any signed-in user · `Viewer` = anyone with a share link, not signed in · `Sys` = background worker.

**Release:** `MVP` = first shippable release · `Next` = straight after · `Later` = only on evidence someone is blocked.

| ID | Use case | Actor | Trigger | Value delivered | Release |
|---|---|---|---|---|---|
| UC-01 | Upload one episode's audio | Rafa | Just finished recording episode 12 | Audio enters the Library and processing starts with no further action | **MVP** |
| UC-02 | Upload per-host tracks alongside the master | Rafa | Riverside/Zencastr produced a master plus 3 host tracks | Exact speaker attribution with no diarisation and no extra transcription — unlocks "who talks most" | **MVP** |
| UC-03 | Upload a two-hour episode | Rafa | Every episode they record | The browser splits it on silence into ~22-minute chunks, compresses each to 16 kHz mono Opus, and the chunks are transcribed in parallel and stitched. **The normal path, not a workaround** | **MVP** |
| UC-04 | Watch processing progress | Any | Upload accepted | Removes dead-time anxiety; says whether to wait or leave | **MVP** |
| UC-05 | See one episode's word statistics | Rafa | Processing completes | "What did this episode actually turn into?" in one glance | **MVP** |
| UC-06 | Drill from any count to every timestamped occurrence | Rafa | Clicks a number | Makes every statistic checkable — the difference between fun and fabricated | **MVP** |
| UC-07 | Define a running joke as a tracked Topic | Rafa | Knows the bit by name: "the hotdog thing" | Turns the group's private vocabulary into a real metric. **The headline feature.** | **MVP** |
| UC-08 | See running-joke counts for one episode | Rafa | Opens an episode | "Did we do the bit?" answered immediately | **MVP** |
| UC-09 | Group episodes into a Series with numbers | Rafa | Second episode uploaded | Episodes become a show instead of a pile of files | **MVP** |
| UC-10 | See a running joke's count across every episode | Rafa | "Is the hotdog thing getting worse?" | **The actual product.** No single episode can answer this | **MVP** |
| UC-11 | See the season's running-joke leaderboard | Rafa | End of a season, or any idle Tuesday | *"we said 'anyway' 312 times this season"* — the screenshot-worthy number | **MVP** |
| UC-12 | Apply a new running joke to past episodes | Rafa | Invents a Topic in episode 12 he wishes he'd tracked from episode 1 | Back catalogue gains new answers with no re-transcription | **MVP** |
| UC-13 | See who talked most, per episode | Rafa / Mel | An episode with host tracks is ready | Settles a recurring argument. Classic podcast stat | **MVP** |
| UC-14 | Share one episode's stats by public link | Rafa → Mel / Viewer | Wants to post it in the group chat | Distribution. A pretty public stats page is something a podcast would actually post | **MVP** |
| UC-15 | Open a shared stats page on a phone, not signed in | Viewer | Taps a link in a group chat | Zero-friction consumption; no account required to look | **MVP** |
| UC-16 | Sign in with a magic link and see only my own Library | Any | Returns to the app | Each friend gets their own library without passwords or admin | **MVP** |
| UC-17 | Browse the Series and its episodes | Rafa | Returns after a week | Finds the episode; sees the show as an accumulating thing | **MVP** |
| UC-18 | Recover from an unsupported file | Any | Drops a `.mov` or a `.pdf` | A specific fix, before any bytes or daily quota are spent | **MVP** |
| UC-19 | Be refused a file past 150 minutes, with numbers | Any | A 3-hour live special | Knows the real limit and that it is the daily allowance, not the file | **MVP** |
| UC-20 | Recover from a processing failure | Any / Sys | Transcription errors out | Terminal `failed` state with a one-click retry, never silent limbo | **MVP** |
| UC-21 | Be told which allowance ran out and when it lifts | Any / Sys | Second two-hour episode in the same hour | "Try again in 34 minutes", in hours, not a mysterious failure | **MVP** |
| UC-22 | Delete an episode and everything derived from it | Any | Mistake, or reclaiming storage | Control over their own audio; also the storage-pressure valve | **MVP** |
| UC-23 | Compare two episodes side by side | Rafa | "Was last week worse?" | Change detection without manual diffing | **Next** |
| UC-24 | Read the transcript with timestamps | Rafa | Writing show notes, or doubts a quote | Reuse of work already paid for in processing time | **Next** |
| UC-25 | See filler-word and pace stats | Rafa / Mel | Vanity | "Mel says 'like' 4.2 times a minute" is exactly the fun this app is for | **Next** |
| UC-26 | Be warned when audio is too poor to trust | Rafa | Someone's track was recorded in a car | Prevents presenting garbage as a finding | **Next** |
| UC-27 | Refuse non-English audio clearly | Any | Uploads a Portuguese episode | Honest refusal beats a silently-wrong word count | **Next** |
| UC-28 | Skip a duplicate upload | Any | Uploads the same track twice | Protects the shared daily audio budget from being burned twice | **Next** |
| UC-29 | Purge an episode's audio, keep its stats | Any | 1 GB storage is nearly full | Keeps the Series analytically intact when storage runs out | **Next** |
| UC-30 | Delete my account and all my data | Any | Leaves the group | Leaving is as easy as joining | **Next** |
| UC-33 | Backfill the back catalogue in batches over days | Rafa | 50 old episodes, 92 audio-hours | The whole show in the Series, at four episodes a day, with storage purged as it goes | **Next** |
| UC-31 | Compare this season to the last | Rafa | Season 2 finale | The long-horizon version of UC-10 | **Later** |
| UC-32 | Ask a question in natural language across the Series | Rafa | *"How many times did we ever talk about hotdogs?"* | The north star. Cheap only if UC-06/UC-10 are built on a token-level index | **Later** |

---

## Scope boundaries

- **UC-16 → UC-01 → UC-05 is the walking skeleton.** Sign-in is in it because tenancy retrofits badly, and because "friends can use it" is the whole premise.
- **UC-10 and UC-11 are not enrichment, they are the product.** A podcast with one analysed episode is nearly useless. Earlier drafts put cross-episode work in month three; that was the single biggest mis-scope.
- **UC-02 is the answer to UC-13, and it is the only one available.** The hosted transcription does no diarisation. But host tracks must never be transcribed separately: every mic picks up the others faintly, so the same sentence would land in two transcripts and inflate every count, at three times the allowance. Transcribe the master once; use the host tracks only as an energy signal to attribute each word to whoever was loudest. Groups with a single mixed file get everything except per-host stats — the stated fallback, not a failure.
- **UC-06 is non-negotiable in MVP.** Without drill-down every count is an unfalsifiable claim, and a joke nobody can verify is not funny.
- **UC-21 and UC-33 exist because the allowance is shared and small.** Two audio-hours per hour and eight per day across all users is about one two-hour episode an hour and four a day. Ample for a weekly show; a 50-episode backfill is a two-week project, and at ~22 MB an episode it hits the 1 GB storage ceiling before it hits the allowance. Both facts must be stated in hours and gigabytes, up front.

## Deliberately dropped from earlier drafts

Bulk archive import · CRM/dialer ingest · per-speaker coaching metrics · consent and notice flows · CSV export · retention policies · teams, roles and shared libraries · PII redaction · billing and quotas. Each belonged to a product with a business. This one has friends.
