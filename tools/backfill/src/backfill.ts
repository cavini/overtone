import { IN_FLIGHT_STATUSES, type EpisodeFeed, type FeedEpisode } from '@overtone/core'
import { join } from 'node:path'
import { audioFileName } from './audio-file-name.js'
import { SAMPLE_RATE, type splitAndUpload } from './borrowed-from-the-app.js'
import type {
  LibraryEpisode,
  PendingEpisode,
  StartRequest,
  StartedEpisode,
} from './overtone-api.js'

/**
 * Walking a back catalogue into the app, one episode at a time, over days.
 *
 * The shape of this is set by two numbers that are nowhere near each other.
 * Uploading an episode takes as long as the connection needs; transcribing
 * one costs about a third of a day's free allowance, so the pipeline drains
 * roughly **three episodes a day** (ADR 0020). Audio is freed chunk by chunk
 * as it is transcribed (ADR 0031), so the bucket only ever holds what is
 * still untranscribed — which is only true if the uploads are paced to match
 * the draining. Uploading the whole archive as fast as it downloads would
 * put a few hundred megabytes an episode into a tier of about a gigabyte.
 *
 * Hence: **one episode in flight at a time**, and the app itself is asked
 * what "in flight" means rather than this keeping a tally. Which is also
 * what makes the run resumable. It keeps no state of its own — no file, no
 * cursor, nothing in memory that matters past the next call — because the
 * run spans days and will be interrupted. Everything it needs to decide is
 * asked fresh: what the feed publishes, what the app already holds, and
 * whether anything is still working. Starting it again is always safe.
 */

/**
 * How long to wait before asking the app again whether it is free.
 *
 * A chunk of audio takes minutes to earn back from an allowance refilling
 * at two audio-seconds a wall-second, so a tighter poll would be a request
 * a second to learn nothing. The schedule itself only runs once a minute.
 */
const POLL_MS = 60_000

/**
 * How many goes one episode gets.
 *
 * Two in total: the first, and one more after the signed upload URLs have
 * expired underneath it. A third would be the same fifteen minutes against
 * the same connection.
 */
const RESTARTS = 1

/**
 * How many failures in a row before stopping.
 *
 * A run that fails on everything — the app is down, the password changed,
 * ffmpeg went missing — should say so once rather than march through a
 * hundred episodes repeating it, and must not look like it finished.
 */
const GIVE_UP_AFTER = 3

/**
 * How many times the room check may fail before the run gives up.
 *
 * It must tolerate some failure. The app is a thing that gets redeployed,
 * restarted and slept, and this waits on it once a minute for days — a
 * single `fetch failed` ending the run is what actually happened, one
 * episode into ten, when the dev server was restarted underneath it.
 *
 * Not unlimited, because an app that is never coming back should say so
 * rather than poll politely forever. Thirty polls is about half an hour.
 */
const OUTAGE_POLLS = 30

/** Just the part of the app's API this needs, so a test can stand in. */
export interface BackfillApp {
  list(): Promise<readonly LibraryEpisode[]>
  pending(): Promise<PendingEpisode | undefined>
  start(request: StartRequest): Promise<StartedEpisode>
  recordBoundaries(episodeId: string, startsMs: readonly number[]): Promise<void>
  forget(episodeId: string): Promise<void>
}

export interface BackfillTools {
  readonly feed: EpisodeFeed
  readonly app: BackfillApp
  readonly download: (url: string, toPath: string) => Promise<void>
  /** SHA-256 of the file, hex — what the app dedupes on. */
  readonly digest: (path: string) => Promise<string>
  /** The whole episode as 16 kHz mono samples. ffmpeg, in the real run. */
  readonly decode: (path: string) => Promise<Float32Array>
  /** The browser's own splitter, which is the point of the exercise. */
  readonly upload: typeof splitAndUpload
  readonly discard: (path: string) => Promise<void>
  readonly sleep: (ms: number) => Promise<void>
  readonly say: (line: string) => void
}

export interface BackfillPlan {
  /** The programme, as the feed spells it: `Chuva de Canivetes`. */
  readonly show: string
  readonly howMany: number
  /** Which language the episodes are transcribed as. */
  readonly locale: string
  /** Where to put each download while it is being worked on. */
  readonly into: string
}

type Outcome = 'uploaded' | 'already-here' | 'failed'

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Whether this failure was a signed URL running out of time.
 *
 * Matched on the status in the message rather than a type, because the
 * refusal comes from storage through `fetch` and there is nothing richer to
 * match on. A URL is good for fifteen minutes (`AUDIO_URL_TTL_SECONDS`) and
 * a real episode is a few hundred megabytes, so on a slow connection this is
 * an ordinary outcome rather than an exceptional one.
 */
const urlsExpired = (error: unknown): boolean => /\b403\b/u.test(reasonOf(error))

/**
 * Whether the app already holds this published episode.
 *
 * Two ways, because an episode can be filed under either title. Normally it
 * carries the publisher's own, looked up in the feed at upload time; when
 * the feed could not be reached it carries the one read from the filename
 * instead. The number plus the programme catches the second — scoped to the
 * programme, because one feed carries several shows numbered independently
 * and somebody else's episode 1 is not this one's.
 *
 * This is the cheap half of the check. The authority is the app's own
 * fingerprint of the audio, which only answers once the file is downloaded.
 */
function alreadyHeld(
  library: readonly LibraryEpisode[],
  show: string,
  episode: FeedEpisode,
): LibraryEpisode | undefined {
  const programme = show.trim().toLowerCase()

  return library.find(
    (held) =>
      held.title === episode.title ||
      (held.title.trim().toLowerCase().startsWith(programme) && held.number === episode.number),
  )
}

/**
 * Waits until the app is not working on anything.
 *
 * `/api/episodes/list` rather than `/api/episodes/pending`, because pending
 * only answers about an episode that is *transcribing* — an episode that has
 * been uploaded and not yet picked up by the schedule is invisible to it,
 * and that is precisely the state this tool leaves behind. `pending` is
 * asked too, for something legible to print while waiting.
 */
async function waitForRoom(tools: BackfillTools): Promise<void> {
  let lastSaid = ''
  let outage = 0

  for (;;) {
    /*
     * An unreachable app is a reason to wait, not a reason to stop.
     *
     * This is the one call that happens outside the per-episode guard, so
     * before this it was the one call whose failure ended the run — which
     * is precisely what a redeploy, a sleeping laptop or a wifi blip looks
     * like from here.
     */
    let library
    try {
      library = await tools.app.list()
      outage = 0
    } catch (error) {
      outage += 1
      if (outage >= OUTAGE_POLLS) {
        throw new Error(
          `the app has been unreachable for ${String(outage)} polls: ${reasonOf(error)}`,
        )
      }

      tools.say(`waiting — cannot reach the app (${reasonOf(error)}), retrying`)
      await tools.sleep(POLL_MS)
      continue
    }

    const working = library.filter((episode) => IN_FLIGHT_STATUSES.has(episode.status))
    if (working.length === 0) return

    /*
     * Labelled from the list, not from `/api/episodes/pending`.
     *
     * Pending reports the oldest episode that is *transcribing*, and when
     * none is, the most recent one worth reading — so in the window between
     * an upload and the schedule picking it up it names an episode that has
     * already finished. A real run printed `waiting — #001, chunk 4 of 4`
     * for minutes while it was waiting for #002. The decision to wait was
     * right, because that comes from the list; only the label was wrong, and
     * over a run measured in days the log is the only window there is.
     */
    const [waitingOn] = working
    const alsoWaiting = working.length - 1
    const line =
      waitingOn === undefined
        ? `waiting — ${String(working.length)} episode(s) still in flight`
        : `waiting — ${waitingOn.title}, chunk ${String(waitingOn.chunksDone)} of ${String(waitingOn.chunkCount)}` +
          (alsoWaiting > 0 ? ` (and ${String(alsoWaiting)} more)` : '')

    // Only when it changes. A two-hour episode takes over an hour to
    // transcribe, and a line a minute for an hour is a log nobody reads.
    if (line !== lastSaid) {
      tools.say(line)
      lastSaid = line
    }

    await tools.sleep(POLL_MS)
  }
}

/**
 * Removes a half-uploaded episode, so it can be started again.
 *
 * Always removes, even when a chunk or two has already been transcribed,
 * and says what that costs. An episode missing some of its chunks can never
 * finish: there is no route that re-signs an upload URL, and
 * `/api/episodes/start` answers `alreadyHave` for audio it has already seen,
 * so the half-uploaded row is a dead end. Left in place it is worse than
 * dead — the schedule reaches for the oldest unfinished episode and this
 * tool waits for the library to be clear, so one stuck episode stops both,
 * permanently. The cost is the allowance already spent on those chunks.
 */
async function abandon(tools: BackfillTools, episodeId: string): Promise<void> {
  const held = (await tools.app.list()).find((episode) => episode.episodeId === episodeId)

  if (held !== undefined && held.chunksDone > 0) {
    tools.say(
      `  dropping it with ${String(held.chunksDone)} chunk(s) already transcribed — that audio will be paid for again`,
    )
  }

  try {
    await tools.app.forget(episodeId)
  } catch (error) {
    // Said rather than thrown: whatever went wrong before this is the thing
    // worth reporting, and a failed clean-up must not replace it.
    tools.say(`  could not remove ${episodeId}: ${reasonOf(error)}`)
  }
}

/** Sends every chunk, boundaries first. See `splitAndUpload`. */
async function sendChunks(
  tools: BackfillTools,
  started: StartedEpisode,
  samples: Float32Array,
): Promise<void> {
  await tools.upload(
    /*
     * Already decoded, handed straight back.
     *
     * The duration had to be known before `/api/episodes/start` could be
     * called — it is what the chunk plan is made from — and it is measured
     * from these samples, so decoding again here would be a second pass
     * over a few hundred megabytes for an answer we have.
     */
    () => Promise.resolve(samples),
    started.chunks,
    ({ done, total }) => {
      if (done > 0) tools.say(`  chunk ${String(done)} of ${String(total)} sent`)
    },
    /*
     * Where the seams settled, before a single byte goes out.
     *
     * Deliberately not caught. The audio is about to be cut on these, so an
     * episode whose boundaries were never recorded would be offset by the
     * planned ones instead — every timestamp after a seam wrong, and every
     * number still looking reasonable. Failing the upload is the cheap
     * outcome.
     */
    (startsMs) => tools.app.recordBoundaries(started.episodeId, startsMs),
  )
}

/** Downloads one episode, uploads it, and deletes the file either way. */
async function oneEpisode(
  tools: BackfillTools,
  plan: BackfillPlan,
  episode: FeedEpisode,
): Promise<Outcome> {
  const fileName = audioFileName(plan.show, episode.number)
  const path = join(plan.into, fileName)
  const label = `#${String(episode.number)} ${episode.title}`

  try {
    tools.say(`${label} — downloading`)
    await tools.download(episode.audioUrl, path)

    const audioDigest = await tools.digest(path)
    const samples = await tools.decode(path)
    /*
     * The duration comes from the audio, not from the feed.
     *
     * `itunes:duration` is often rounded to the second and sometimes
     * absent, and this number decides the chunk plan — one a few seconds
     * short would silently drop the end of the episode, because the last
     * chunk is cut at the planned end rather than at the last sample.
     */
    const durationMs = Math.round((samples.length / SAMPLE_RATE) * 1000)

    for (let attempt = 0; ; attempt += 1) {
      const started = await tools.app.start({
        durationMs,
        fileName,
        audioDigest,
        locale: plan.locale,
      })

      if (started.alreadyHave) {
        /*
         * The same audio, whatever it was called this time.
         *
         * Nothing is uploaded and nothing is driven: re-transcribing a
         * two-hour episode spends about a third of a day's free allowance to
         * arrive at the transcript that is already in the database.
         */
        if (attempt === 0) {
          tools.say(`${label} — already here as "${started.title}", left alone`)
          return 'already-here'
        }

        /*
         * On a second attempt it means the opposite. The episode this is
         * being matched against is the half-uploaded one that was just
         * supposed to be dropped — so the drop did not take, and the app is
         * handing back a row whose chunks will never arrive. Reporting that
         * as "already here" would mark a dead episode done, and it would go
         * on blocking both the schedule and this tool.
         */
        throw new Error(
          `the app still holds the half-uploaded episode ${started.episodeId}, so it cannot be started again — remove it and re-run`,
        )
      }

      tools.say(`${label} — uploading ${String(started.chunks.length)} chunk(s)`)

      try {
        await sendChunks(tools, started, samples)
        tools.say(`${label} — uploaded; the schedule will transcribe it`)
        return 'uploaded'
      } catch (error) {
        await abandon(tools, started.episodeId)

        if (attempt >= RESTARTS || !urlsExpired(error)) throw error

        // With the refusal in it. The reason is about to be thrown away by
        // the retry, and a log that only says "starting it again" leaves
        // nothing to tell an expired URL from a storage outage.
        tools.say(
          `${label} — ${reasonOf(error)}; the upload urls have expired, starting it again`,
        )
      }
    }
  } catch (error) {
    tools.say(`${label} — failed: ${reasonOf(error)}`)
    return 'failed'
  } finally {
    // A hundred megabytes an episode. Left behind, a run across a back
    // catalogue fills the disk it was started from.
    await tools.discard(path)
  }
}

export async function backfill(tools: BackfillTools, plan: BackfillPlan): Promise<void> {
  /*
   * A blank show is not "all of them".
   *
   * The adapter reads a blank filter as "every item", which is right for a
   * feed with one show in it. This feed carries several of the collective's
   * programmes, numbered independently, and both the filename and the
   * already-here check below assume one programme — so an empty filter here
   * would pull somebody else's episode 1, file it under a programme called
   * nothing, and collide with this show's own numbering.
   */
  if (plan.show.trim().length === 0) {
    throw new Error('which show? a blank name would walk every programme in the feed at once')
  }

  const feed = await tools.feed.list()

  /*
   * Fail here, clearly, rather than on the first upload.
   *
   * Unreachable *during* a run is something to wait out — see
   * `waitForRoom`. Unreachable at the start is almost always that nobody
   * started the app, and `fetch failed` on its own sends people looking at
   * the feed, the network and the password instead.
   */
  let library
  try {
    library = await tools.app.list()
  } catch (error) {
    throw new Error(
      `could not reach the app to ask what it already has (${reasonOf(error)}) — is it running?`,
    )
  }

  const todo = feed
    .filter((episode) => alreadyHeld(library, plan.show, episode) === undefined)
    .slice(0, plan.howMany)

  tools.say(
    `${plan.show}: ${String(feed.length)} published, ${String(library.length)} already here, ${String(todo.length)} to do now`,
  )

  let inARow = 0

  for (const episode of todo) {
    await waitForRoom(tools)

    inARow = (await oneEpisode(tools, plan, episode)) === 'failed' ? inARow + 1 : 0

    if (inARow >= GIVE_UP_AFTER) {
      throw new Error(
        `stopping: ${String(inARow)} episodes failed in a row, so something is wrong with the run rather than with one episode`,
      )
    }
  }

  tools.say(`${plan.show}: nothing more to do in this run`)
}
