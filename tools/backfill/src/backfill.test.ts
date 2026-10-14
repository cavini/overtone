// The loop: one episode at a time, oldest first, resumable across days.
//
// Everything is injected and nothing here touches the world — no network, no
// ffmpeg, no feed, no filesystem. But the uploading is **the real
// `splitAndUpload`**, the same function the browser calls, with `fetch`
// stubbed underneath it. That is deliberate: the ordering it guarantees —
// the settled boundaries recorded before a single byte goes out — is the one
// thing in this repo that fails silently, and a fake upload here would
// assert that the tool calls a stub in the right order rather than that the
// episode is actually cut and reported correctly.
//
// Transcription is nobody's business here: `pg_cron` advances the oldest
// unfinished episode every minute and pauses itself when the day's allowance
// is spent (ADR 0027). The app interface this takes has no way to ask for a
// transcript, which is the real guarantee that no test can ever reach Groq.
import { planChunks, readEpisodeName, type EpisodeStatus } from '@overtone/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backfill, type BackfillApp, type BackfillTools } from './backfill.js'
import { splitAndUpload, SAMPLE_RATE } from './borrowed-from-the-app.js'
import type { LibraryEpisode, PendingEpisode, StartRequest, StartedEpisode } from './overtone-api.js'
import type { FeedEpisode } from '@overtone/core'

const SHOW = 'Chuva de Canivetes'
const IN_FLIGHT: readonly EpisodeStatus[] = ['uploaded', 'transcribing', 'analyzing']

/** What happened, in order, across the app and the uploads alike. */
let trace: string[]
let uploadStatus: number
/** Upload URLs to answer 403 to, standing in for a signed URL that expired. */
let expired: RegExp | undefined

const published = (number: number): FeedEpisode => ({
  number,
  title: `Chuva de Canivetes #${String(number).padStart(3, '0')}`,
  description: `notas ${String(number)}`,
  audioUrl: `https://cdn.example/canivetes-${String(number)}.mp3`,
  audioBytes: 90_000_000,
})

/**
 * Audio that is loud the whole way through.
 *
 * Which means `settleChunks` finds no gap to move a seam into and leaves
 * every boundary where the plan put it — the documented behaviour for an
 * unbroken stretch of speech, and what makes these assertions exact. Where
 * the seams go when there *are* gaps is `cuts-land-in-gaps.test.ts`.
 */
const loudFor = (ms: number): Float32Array =>
  new Float32Array(Math.round((ms / 1000) * SAMPLE_RATE)).fill(0.5)

/** An app that behaves the way the real one does, in memory. */
class FakeApp implements BackfillApp {
  readonly library: LibraryEpisode[] = []
  readonly boundaries = new Map<string, readonly number[]>()
  readonly started: StartRequest[] = []
  private nextId = 1

  list(): Promise<readonly LibraryEpisode[]> {
    trace.push('list')
    return Promise.resolve([...this.library])
  }

  pending(): Promise<PendingEpisode | undefined> {
    trace.push('pending')
    const live = this.library.find((episode) => IN_FLIGHT.includes(episode.status))

    return Promise.resolve(
      live === undefined
        ? undefined
        : {
            episodeId: live.episodeId,
            title: live.title,
            chunksDone: live.chunksDone,
            chunkCount: live.chunkCount,
            live: true,
          },
    )
  }

  start(request: StartRequest): Promise<StartedEpisode> {
    this.started.push(request)

    /*
     * The same audio under any name is the same episode. Matched on the
     * digest alone, before anything else is looked at, which is what the
     * real route does — the title it is filed under has no bearing on it.
     */
    const seen = this.digests.get(request.audioDigest)
    const known = this.library.find((episode) => episode.episodeId === seen)
    if (known !== undefined) {
      trace.push(`start ${request.fileName} -> already have`)
      return Promise.resolve({
        episodeId: known.episodeId,
        chunks: [],
        alreadyHave: true,
        title: known.title,
      })
    }

    const episodeId = `ep-${String(this.nextId)}`
    this.nextId += 1
    this.digests.set(request.audioDigest, episodeId)

    const chunks = planChunks(request.durationMs).map((chunk) => ({
      ...chunk,
      uploadUrl: `https://store.example/${episodeId}/${request.fileName}/chunk-${String(chunk.index)}`,
    }))

    this.library.push({
      episodeId,
      number: readEpisodeName(request.fileName).number ?? 0,
      title: this.titleFor(request),
      durationMs: request.durationMs,
      // What the real route leaves an episode in: uploaded, waiting for the
      // schedule to pick it up.
      status: 'uploaded',
      chunksDone: 0,
      chunkCount: chunks.length,
    })

    trace.push(`start ${request.fileName} -> ${episodeId}`)

    return Promise.resolve({ episodeId, chunks, alreadyHave: false, title: this.titleFor(request) })
  }

  recordBoundaries(episodeId: string, startsMs: readonly number[]): Promise<void> {
    this.boundaries.set(episodeId, startsMs)
    trace.push(`boundaries ${episodeId}`)
    return Promise.resolve()
  }

  forget(episodeId: string): Promise<void> {
    const at = this.library.findIndex((episode) => episode.episodeId === episodeId)
    if (at >= 0) this.library.splice(at, 1)
    trace.push(`forget ${episodeId}`)
    return Promise.resolve()
  }

  /** The publisher's title, which is what the real route stores. */
  private titleFor(request: StartRequest): string {
    const number = readEpisodeName(request.fileName).number ?? 0
    return published(number).title
  }

  private readonly digests = new Map<string, string>()

  /** Seeds an episode the app already holds, fingerprint included. */
  remember(digest: string, episode: LibraryEpisode): void {
    this.library.push(episode)
    this.digests.set(digest, episode.episodeId)
  }

  /** What the schedule does, between polls. */
  drain(): void {
    for (const episode of this.library) {
      if (IN_FLIGHT.includes(episode.status)) {
        this.library[this.library.indexOf(episode)] = {
          ...episode,
          status: 'ready',
          chunksDone: episode.chunkCount,
        }
      }
    }
  }
}

interface Rig {
  readonly tools: BackfillTools
  readonly app: FakeApp
  readonly said: string[]
  readonly discarded: string[]
  readonly downloaded: string[]
  readonly sleeps: number[]
}

const rigFor = (
  feedNumbers: readonly number[],
  audioMs = 2_000,
  app = new FakeApp(),
): Rig => {
  const said: string[] = []
  const discarded: string[] = []
  const downloaded: string[] = []
  const sleeps: number[] = []

  const tools: BackfillTools = {
    feed: { list: () => Promise.resolve(feedNumbers.map(published)) },
    app,
    download: (url, toPath) => {
      downloaded.push(`${url} -> ${toPath}`)
      trace.push('download')
      return Promise.resolve()
    },
    digest: (path) => Promise.resolve(`digest-of-${path}`),
    decode: () => Promise.resolve(loudFor(audioMs)),
    upload: splitAndUpload,
    discard: (path) => {
      discarded.push(path)
      return Promise.resolve()
    },
    sleep: (ms) => {
      sleeps.push(ms)
      // Standing in for the schedule, which is what actually clears the way.
      app.drain()
      return Promise.resolve()
    },
    say: (line) => said.push(line),
  }

  return { tools, app, said, discarded, downloaded, sleeps }
}

const plan = (howMany: number) => ({
  show: SHOW,
  howMany,
  locale: 'pt',
  into: '/tmp/overtone',
})

beforeEach(() => {
  trace = []
  uploadStatus = 200
  expired = undefined

  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    trace.push(`PUT ${url}`)
    const status = expired?.test(url) === true ? 403 : uploadStatus

    return Promise.resolve({ ok: status < 400, status, method: init.method })
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('which episodes it does', () => {
  it('starts at the oldest and works forward', async () => {
    const rig = rigFor([1, 2, 3, 4, 5])

    await backfill(rig.tools, plan(3))

    expect(rig.app.started.map((request) => request.fileName)).toEqual([
      'chuva-de-canivetes-001.mp3',
      'chuva-de-canivetes-002.mp3',
      'chuva-de-canivetes-003.mp3',
    ])
  })

  it('does only as many as it was asked for', async () => {
    const rig = rigFor([1, 2, 3, 4, 5])

    await backfill(rig.tools, plan(1))

    expect(rig.app.started).toHaveLength(1)
  })

  /*
   * Resumability, and the cheap half of it: the app is asked what it holds
   * before anything is downloaded. Re-running this tool must be safe, and a
   * hundred megabytes pulled over somebody's connection to then be told
   * `alreadyHave` is not safe enough to be worth it.
   */
  it('skips an episode the app already holds', async () => {
    const rig = rigFor([1, 2, 3])
    rig.app.library.push({
      episodeId: 'old',
      number: 2,
      title: 'Chuva de Canivetes #002',
      durationMs: 7_000_000,
      status: 'ready',
      chunksDone: 12,
      chunkCount: 12,
    })

    await backfill(rig.tools, plan(3))

    expect(rig.app.started.map((request) => request.fileName)).toEqual([
      'chuva-de-canivetes-001.mp3',
      'chuva-de-canivetes-003.mp3',
    ])
  })

  /*
   * An episode uploaded while the feed was unreachable is filed under the
   * title read from its filename instead of the published one, so matching
   * titles alone would download it again. The number plus the programme is
   * the same episode either way.
   */
  it('skips one the app holds under a title read from the filename', async () => {
    const rig = rigFor([1, 2])
    rig.app.library.push({
      episodeId: 'old',
      number: 1,
      title: 'Chuva de Canivetes 001',
      durationMs: 7_000_000,
      status: 'ready',
      chunksDone: 12,
      chunkCount: 12,
    })

    await backfill(rig.tools, plan(2))

    expect(rig.app.started.map((request) => request.fileName)).toEqual([
      'chuva-de-canivetes-002.mp3',
    ])
  })

  // Another programme's episode 1 is not this one's. One feed carries
  // several shows and they are numbered independently.
  it('does not mistake another programme for this one', async () => {
    const rig = rigFor([1])
    rig.app.library.push({
      episodeId: 'other',
      number: 1,
      title: 'Outro Programa #001',
      durationMs: 7_000_000,
      status: 'ready',
      chunksDone: 12,
      chunkCount: 12,
    })

    await backfill(rig.tools, plan(1))

    expect(rig.app.started).toHaveLength(1)
  })

  /*
   * The authority on "do you have this" is the app's own fingerprint, and
   * it is the only one that holds when a title was changed or an episode was
   * re-released. Nothing is uploaded and nothing is driven.
   */
  it('leaves an episode the app recognises by its fingerprint alone', async () => {
    const rig = rigFor([1])
    // Filed under a title that matches neither the feed's nor the
    // filename's, so nothing but the fingerprint can recognise it.
    rig.app.remember('digest-of-/tmp/overtone/chuva-de-canivetes-001.mp3', {
      episodeId: 'ep-known',
      number: 404,
      title: 'Something Nobody Would Guess',
      durationMs: 2_000,
      status: 'ready',
      chunksDone: 1,
      chunkCount: 1,
    })

    await backfill(rig.tools, plan(1))

    expect(trace.filter((line) => line.startsWith('PUT'))).toEqual([])
    expect(rig.said.join('\n')).toMatch(/already/u)
  })
})

describe('one episode in flight at a time', () => {
  /*
   * The ceiling this exists for. Transcription drains about three episodes
   * a day while uploading is as fast as the connection, so uploading
   * everything at once would hold the whole back catalogue in a bucket of
   * about a gigabyte. Audio is freed per chunk as it is transcribed
   * (ADR 0031), so waiting is what keeps the peak to one episode.
   */
  it('waits for the library to be clear before it starts anything', async () => {
    const rig = rigFor([1])
    rig.app.library.push({
      episodeId: 'busy',
      number: 99,
      title: 'Something Else #099',
      durationMs: 7_000_000,
      status: 'transcribing',
      chunksDone: 4,
      chunkCount: 13,
    })

    await backfill(rig.tools, plan(1))

    expect(rig.sleeps.length).toBeGreaterThan(0)
    // It waited first and started afterwards, not the other way round.
    const firstStart = trace.findIndex((line) => line.startsWith('start'))
    const firstPending = trace.indexOf('pending')
    expect(firstPending).toBeGreaterThanOrEqual(0)
    expect(firstPending).toBeLessThan(firstStart)
  })

  it('waits again between one episode and the next', async () => {
    const rig = rigFor([1, 2])

    await backfill(rig.tools, plan(2))

    // The first upload leaves its episode `uploaded`, so the second one has
    // to wait for the schedule to take it.
    expect(rig.sleeps.length).toBeGreaterThan(0)
    const starts = trace.filter((line) => line.startsWith('start') || line === 'pending')
    expect(starts[0]).toMatch(/^start/u)
    expect(starts).toContain('pending')
  })

  it('says what it is waiting for', async () => {
    const rig = rigFor([1])
    rig.app.library.push({
      episodeId: 'busy',
      number: 99,
      title: 'Chuva de Canivetes #099',
      durationMs: 7_000_000,
      status: 'transcribing',
      chunksDone: 4,
      chunkCount: 13,
    })

    await backfill(rig.tools, plan(1))

    expect(rig.said.join('\n')).toMatch(/Chuva de Canivetes #099/u)
    expect(rig.said.join('\n')).toMatch(/4\D+13/u)
  })
})

describe('doing one episode', () => {
  it('downloads the enclosure to a file named for the show and the number', async () => {
    const rig = rigFor([7])

    await backfill(rig.tools, plan(1))

    expect(rig.downloaded).toEqual([
      'https://cdn.example/canivetes-7.mp3 -> /tmp/overtone/chuva-de-canivetes-007.mp3',
    ])
  })

  // The filename is the only thing carrying the programme and the number,
  // and `#` would stop the number being read at all.
  it('sends the app a filename it can read', async () => {
    const rig = rigFor([7])

    await backfill(rig.tools, plan(1))

    expect(rig.app.started[0]?.fileName).toBe('chuva-de-canivetes-007.mp3')
    expect(rig.app.started[0]?.fileName).not.toContain('#')
  })

  /*
   * Measured from the samples, not taken from the feed. `itunes:duration`
   * is often rounded and sometimes absent, and the duration decides the
   * chunk plan — a figure a few seconds short silently drops the end of
   * the episode.
   */
  it('works the duration out of the audio it decoded', async () => {
    const rig = rigFor([1], 754_000)

    await backfill(rig.tools, plan(1))

    expect(rig.app.started[0]?.durationMs).toBe(754_000)
  })

  it('sends the fingerprint of what it downloaded', async () => {
    const rig = rigFor([1])

    await backfill(rig.tools, plan(1))

    expect(rig.app.started[0]?.audioDigest).toBe(
      'digest-of-/tmp/overtone/chuva-de-canivetes-001.mp3',
    )
  })

  /*
   * The ordering the whole feature rests on, asserted through the real
   * splitter rather than around it: the audio is cut on the settled
   * boundaries, so an episode whose boundaries were never recorded would be
   * offset by the planned ones instead — every timestamp after a seam
   * wrong, every number still plausible.
   */
  it('records where the seams landed before it sends a byte', async () => {
    const rig = rigFor([1], 754_000)

    await backfill(rig.tools, plan(1))

    const ordered = trace.filter((line) => line.startsWith('boundaries') || line.startsWith('PUT'))
    expect(ordered[0]).toMatch(/^boundaries/u)
    expect(ordered.filter((line) => line.startsWith('PUT')).length).toBeGreaterThan(1)
  })

  it('sends every chunk the app asked for, each to its own url', async () => {
    const rig = rigFor([1], 754_000)

    await backfill(rig.tools, plan(1))

    const puts = trace.filter((line) => line.startsWith('PUT'))
    expect(puts).toHaveLength(planChunks(754_000).length)
    expect(new Set(puts).size).toBe(puts.length)
  })

  it('reports the boundaries it actually cut on', async () => {
    const rig = rigFor([1], 754_000)

    await backfill(rig.tools, plan(1))

    const reported = rig.app.boundaries.get('ep-1') ?? []
    expect(reported).toHaveLength(planChunks(754_000).length)
    expect(reported[0]).toBe(0)
  })

  // A hundred megabytes an episode. Left behind, a run across the back
  // catalogue fills the disk it is run from.
  it('deletes the download when it is done with it', async () => {
    const rig = rigFor([1, 2])

    await backfill(rig.tools, plan(2))

    expect(rig.discarded).toEqual([
      '/tmp/overtone/chuva-de-canivetes-001.mp3',
      '/tmp/overtone/chuva-de-canivetes-002.mp3',
    ])
  })

  it('deletes the download even when the episode failed', async () => {
    const rig = rigFor([1])
    uploadStatus = 500

    await backfill(rig.tools, plan(1))

    expect(rig.discarded).toEqual(['/tmp/overtone/chuva-de-canivetes-001.mp3'])
  })

  it('names the episode it is working on as it goes', async () => {
    const rig = rigFor([3])

    await backfill(rig.tools, plan(1))

    expect(rig.said.join('\n')).toMatch(/Chuva de Canivetes #003/u)
  })
})

describe('when an upload url has expired', () => {
  /*
   * A signed URL lasts fifteen minutes and a real episode is a few hundred
   * megabytes, so this is an ordinary outcome on a slow connection rather
   * than an exceptional one. There is no route that re-signs a URL, and
   * `/api/episodes/start` answers `alreadyHave` for audio it has seen — so
   * the only way back is to drop the half-uploaded episode and start it
   * again.
   */
  it('drops the half-uploaded episode and starts it over', async () => {
    const rig = rigFor([1], 754_000)
    // The first attempt only. `ep-1` is the episode the app creates for it;
    // the second attempt gets a new row, and a new set of urls.
    expired = /\/ep-1\//u

    await backfill(rig.tools, plan(1))

    expect(trace).toContain('forget ep-1')
    expect(rig.app.started).toHaveLength(2)
    // The second attempt is a new episode, uploaded in full.
    expect(rig.app.boundaries.has('ep-2')).toBe(true)
    expect(rig.said.join('\n')).toMatch(/expired/u)
  })

  it('gives up on that episode after one more go, and carries on', async () => {
    const rig = rigFor([1, 2], 754_000)
    // Every attempt at episode 1, however many rows it is given; episode 2
    // uploads normally.
    expired = /chuva-de-canivetes-001/u

    await backfill(rig.tools, plan(2))

    // Two goes at the first, then on to the second.
    expect(rig.app.started.filter((r) => r.fileName.endsWith('001.mp3'))).toHaveLength(2)
    expect(rig.app.started.filter((r) => r.fileName.endsWith('002.mp3'))).toHaveLength(1)
  })

  /*
   * An episode left `uploaded` with chunks that will never arrive is worse
   * than a deleted one: the schedule reaches for the oldest unfinished
   * episode, and the room check waits for the library to be clear — so one
   * stuck episode stops both the pipeline and this tool, for good.
   */
  it('leaves nothing half-uploaded behind', async () => {
    const rig = rigFor([1], 754_000)
    expired = /chuva-de-canivetes-001/u

    await backfill(rig.tools, plan(1))

    expect(rig.app.library).toEqual([])
  })
})

describe('when something else goes wrong', () => {
  it('carries on to the next episode', async () => {
    const rig = rigFor([1, 2])
    const failing = { ...rig.tools, download: (url: string) => Promise.reject(new Error(`no: ${url}`)) }

    // The first download fails; the second must still be attempted.
    let attempts = 0
    const tools: BackfillTools = {
      ...failing,
      download: (url, toPath) => {
        attempts += 1
        return attempts === 1
          ? Promise.reject(new Error('connection reset'))
          : rig.tools.download(url, toPath)
      },
    }

    await backfill(tools, plan(2))

    expect(attempts).toBe(2)
    expect(rig.app.started.map((request) => request.fileName)).toEqual([
      'chuva-de-canivetes-002.mp3',
    ])
  })

  it('says what went wrong rather than swallowing it', async () => {
    const rig = rigFor([1])
    const tools: BackfillTools = {
      ...rig.tools,
      decode: () => Promise.reject(new Error('ffmpeg is not installed')),
    }

    await backfill(tools, plan(1))

    expect(rig.said.join('\n')).toMatch(/ffmpeg is not installed/u)
  })

  /*
   * A run that fails on everything should stop rather than march through a
   * hundred episodes reporting the same error, and it must not look like it
   * finished the job.
   */
  it('stops once several in a row have failed', async () => {
    const rig = rigFor([1, 2, 3, 4, 5])
    const tools: BackfillTools = {
      ...rig.tools,
      download: () => Promise.reject(new Error('connection reset')),
    }

    await expect(backfill(tools, plan(5))).rejects.toThrow(/in a row/u)
  })
})

describe('cleaning up a half-uploaded episode', () => {
  /** An app whose schedule got to a chunk before the upload finished. */
  class PartlyTranscribed extends FakeApp {
    override async list(): Promise<readonly LibraryEpisode[]> {
      return (await super.list()).map((episode) =>
        episode.status === 'uploaded' ? { ...episode, chunksDone: 1 } : episode,
      )
    }
  }

  /*
   * The honest version of the cost. `pg_cron` advances the oldest
   * unfinished episode every minute, so by the time a fifteen-minute upload
   * URL has expired the schedule has very likely transcribed a chunk or two
   * of it already. Dropping the episode is still right — one missing chunk
   * can never be filled in, and a stuck episode blocks the pipeline and
   * this tool for good — but it spends that audio again, and saying so is
   * the difference between a decision and a surprise.
   */
  it('says what dropping it costs when a chunk was already transcribed', async () => {
    const rig = rigFor([1], 754_000, new PartlyTranscribed())
    expired = /\/ep-1\//u

    await backfill(rig.tools, plan(1))

    expect(rig.said.join('\n')).toMatch(/paid for again/u)
  })

  /** An app that will not delete anything today. */
  class WontForget extends FakeApp {
    override forget(): Promise<void> {
      return Promise.reject(new Error('gateway timeout'))
    }
  }

  /*
   * The outcome this must never have. When the clean-up fails the
   * half-uploaded row is still there, so the retry's `/api/episodes/start`
   * matches its fingerprint and hands the same dead episode back as
   * `alreadyHave` — an episode whose remaining chunks will never arrive,
   * reported as one the app already has. Marking that done would leave it
   * blocking the schedule and this tool for good.
   */
  it('does not mistake a failed clean-up for an episode already here', async () => {
    const rig = rigFor([1], 754_000, new WontForget())
    expired = /chuva-de-canivetes-001/u

    await backfill(rig.tools, plan(1))

    const log = rig.said.join('\n')
    expect(log).toMatch(/could not remove/u)
    // The refusal that started it, so an expired url can be told from an
    // outage.
    expect(log).toMatch(/403/u)
    expect(log).toMatch(/failed/u)
    expect(log).not.toMatch(/left alone/u)
  })
})

describe('being told which show', () => {
  /*
   * A blank show name is not "all of them". The feed carries several of the
   * collective's programmes, numbered independently, and both the filename
   * and the already-here check assume one programme — so an empty filter
   * would download somebody else's episode 1, file it under a programme
   * called nothing, and collide with this show's own numbering. The adapter
   * treats a blank show as "every item" by design, which is right for a
   * feed with one show in it and wrong for this.
   */
  it('refuses a blank one rather than walking the whole feed', async () => {
    const rig = rigFor([1, 2])

    await expect(backfill(rig.tools, { ...plan(2), show: '  ' })).rejects.toThrow(/show/u)
    expect(rig.downloaded).toEqual([])
  })
})
