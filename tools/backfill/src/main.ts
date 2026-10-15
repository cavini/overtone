import { RssEpisodeDirectory } from '@overtone/adapters/feed'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { backfill, type BackfillTools } from './backfill.js'
import { digestOf } from './audio-digest.js'
import { splitAndUpload } from './borrowed-from-the-app.js'
import { decodeWithFfmpeg, requireFfmpeg } from './decode-with-ffmpeg.js'
import { downloadAudio } from './download-audio.js'
import { feedFetch } from './feed-from-file.js'
import { OvertoneApi } from './overtone-api.js'
import { readArguments } from './read-arguments.js'
import { spawnProgram } from './spawn-program.js'

/**
 * Where this tool is assembled, and the only module that reads the world.
 *
 * Everything with a decision in it takes what it needs as an argument, so
 * this is the one place that knows there is an environment, a disk, a clock
 * and other programs. It has no logic of its own worth testing, which is why
 * it is left out of the coverage numbers.
 *
 *   pnpm backfill                   # the 10 oldest of OVERTONE_FEED_SHOW
 *   pnpm backfill "<show>" 3        # three of a named one
 *
 * It talks to the app over HTTP like any other client, so the app has to be
 * running: `pnpm dev` in another terminal, or set `OVERTONE_BASE_URL` to a
 * deployment. It never transcribes anything — `pg_cron` advances the oldest
 * unfinished episode every minute and pauses itself when the day's allowance
 * is spent (ADR 0027), so this uploads and leaves.
 */

/**
 * Which show to walk, when the command line does not say.
 *
 * From the environment rather than a constant, because the real programme
 * names belong to somebody's actual podcast and not in this repository. Set
 * `OVERTONE_FEED_SHOW` in `.env.local` beside the feed URL it goes with.
 */
const defaultShow = (): string => required('OVERTONE_FEED_SHOW')

/**
 * Ten, which is about three days of transcribing.
 *
 * The daily allowance holds three episodes of this length, so a bigger
 * default would be a number that only means something after the weekend.
 */
const DEFAULT_HOW_MANY = 10

/** Where `pnpm dev` serves. */
const DEFAULT_BASE_URL = 'http://localhost:3000'

const USAGE = `
Walks a show's own RSS feed and uploads the back catalogue, oldest first.

  pnpm backfill ["<show>"] [how-many]

  <show>      the programme as the feed spells it
              (default: OVERTONE_FEED_SHOW from .env.local)
  how-many    how many to upload in this run (default: ${String(DEFAULT_HOW_MANY)})

Reads OVERTONE_FEED_URL, OVERTONE_FEED_SHOW, OVERTONE_ACCOUNT_EMAIL and
OVERTONE_ACCOUNT_PASSWORD from .env.local at the repo root, and
OVERTONE_BASE_URL if the app is not at ${DEFAULT_BASE_URL}.

Set OVERTONE_FEED_FILE to a saved copy of the feed to read it off disk
instead of asking the show's own feed on every run.

The episodes land in the library of whichever account it signs in as.

One episode is uploaded at a time and the next waits until the app has
finished with the last, because transcription drains about three episodes a
day. Re-running it is safe: it asks the app what it already holds.
`

const here = import.meta.dirname
const repoRoot = resolve(here, '../../..')

// The same file `pnpm dev` and the integration suites read. Loaded here
// rather than wrapped around the command, so the tool can be run directly.
const envFile = resolve(repoRoot, '.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) {
    // Loudly and immediately. A missing key here is a setup mistake, and
    // finding out after a hundred megabytes have been downloaded is worse.
    throw new Error(`${name} is not set. It lives in .env.local at the repo root.`)
  }

  return value
}

async function run(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE)
    return
  }

  const asked = readArguments(args)
  const show = asked.show ?? defaultShow()
  const howMany = asked.howMany ?? DEFAULT_HOW_MANY

  // Before anything is downloaded. ffmpeg is the one thing this needs that
  // the repo does not install.
  await requireFfmpeg(spawnProgram)

  const baseUrl = process.env['OVERTONE_BASE_URL'] ?? DEFAULT_BASE_URL
  const locale = process.env['OVERTONE_LOCALE'] ?? 'pt'

  /*
   * Downloads land in the repo's own `audio/`, which is gitignored.
   *
   * Not a temporary directory: an episode is about a hundred megabytes and
   * each one is deleted as soon as it has been uploaded, so if anything is
   * left there it is a failure worth being able to look at.
   */
  const into = resolve(repoRoot, 'audio/backfill')
  await mkdir(into, { recursive: true })

  const app = new OvertoneApi({ baseUrl })
  console.log(`overtone: ${baseUrl}`)
  await app.enter(required('OVERTONE_ACCOUNT_EMAIL'), required('OVERTONE_ACCOUNT_PASSWORD'))

  const tools: BackfillTools = {
    /*
     * From a saved copy when one is named, over the network otherwise.
     *
     * `OVERTONE_FEED_FILE` exists because the show's private feed URL
     * started answering 401 part-way through a backfill while the audio
     * links inside it kept working — a private feed is meant for one
     * listener's app, not a tool asking for it on every run.
     */
    feed: new RssEpisodeDirectory({
      feedUrl: process.env['OVERTONE_FEED_FILE'] ?? required('OVERTONE_FEED_URL'),
      show,
      fetch: feedFetch(process.env['OVERTONE_FEED_FILE']),
    }),
    app,
    download: (url, toPath) => downloadAudio(url, toPath, spawnProgram),
    digest: (path) => digestOf(createReadStream(path)),
    decode: (path) => decodeWithFfmpeg(path, spawnProgram),
    // The browser's own splitter. The decoder above is the only thing that
    // differs between a tab and this.
    upload: splitAndUpload,
    discard: (path) => rm(path, { force: true }),
    sleep: (ms) =>
      new Promise((done) => {
        setTimeout(done, ms)
      }),
    say: (line) => {
      console.log(`${new Date().toISOString().slice(11, 19)}  ${line}`)
    },
  }

  await backfill(tools, { show, howMany, locale, into })
}

try {
  await run()
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
