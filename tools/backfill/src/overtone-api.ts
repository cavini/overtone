import type { EpisodeStatus } from '@overtone/core'
import { ACCESS_COOKIE, REFRESH_COOKIE, type ChunkTarget } from './borrowed-from-the-app.js'

/**
 * The app's HTTP API, as a program sees it.
 *
 * Deliberately the same calls the upload form makes, in the same order:
 * `/api/enter` for a session, `/api/episodes/start` for an episode and its
 * signed upload URLs, `/api/episodes/boundaries` **before** any audio moves,
 * then one `PUT` per chunk straight to storage. Nothing here invents a route
 * and nothing here talks to the database — a backfill that wrote rows
 * directly would be a second implementation of uploading, free to disagree
 * with the real one.
 *
 * Transcription is nobody's business here. `pg_cron` advances the oldest
 * unfinished episode every minute and stops itself when the day's allowance
 * is spent (ADR 0027), so this tool uploads and leaves.
 */

export interface OvertoneApiOptions {
  /** Where the app is, with no trailing slash: `http://localhost:3000`. */
  readonly baseUrl: string
  readonly fetch?: typeof globalThis.fetch
}

export interface StartRequest {
  readonly durationMs: number
  /**
   * The name of the file, which is where the programme and the episode
   * number come from. See `audio-file-name.ts`.
   */
  readonly fileName: string
  /** SHA-256 of the audio, hex. How the app knows it has this already. */
  readonly audioDigest: string
  readonly locale: string
}

export interface StartedEpisode {
  readonly episodeId: string
  readonly chunks: readonly ChunkTarget[]
  /**
   * This exact audio was already here, so nothing was uploaded.
   *
   * Matched on the digest, not the name. Re-transcribing a two-hour episode
   * costs about a third of a day's allowance to produce the transcript that
   * is already stored.
   */
  readonly alreadyHave: boolean
  /** What the episode is filed under — the publisher's title, usually. */
  readonly title: string
}

export interface LibraryEpisode {
  readonly episodeId: string
  readonly number: number
  readonly title: string
  readonly durationMs: number
  readonly status: EpisodeStatus
  readonly chunksDone: number
  readonly chunkCount: number
}

export interface PendingEpisode {
  readonly episodeId: string
  readonly title: string
  readonly chunksDone: number
  readonly chunkCount: number
  /** Still being transcribed, rather than merely the latest thing to read. */
  readonly live: boolean
}

/**
 * Reads a response that is supposed to be JSON.
 *
 * A platform error — a body too large, a function that timed out — comes
 * back as HTML or plain text, and `response.json()` throws on it. Left
 * unhandled in the browser that surfaced as "the file may be corrupt",
 * which sent everyone looking at the audio instead of at the request.
 */
async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`${String(response.status)} ${text.slice(0, 120)}`)
  }
}

export class OvertoneApi {
  private readonly baseUrl: string
  private readonly fetch: typeof globalThis.fetch
  private cookie: string | undefined

  constructor(options: OvertoneApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/u, '')
    this.fetch = options.fetch ?? globalThis.fetch
  }

  /**
   * Walks the app's front door and keeps the session it hands back.
   *
   * `redirect: 'manual'`, because the answer *is* a redirect and following
   * it would land on a page rather than show the cookie. It also hides the
   * failure: a wrong password answers 303 to the sign-in page — deliberately
   * indistinguishable from an unconfigured one, so the response says nothing
   * about which passwords are close — and that page answers 200, so a
   * followed redirect looks exactly like success.
   *
   * Then the session is **proved rather than assumed**, with one cheap
   * authenticated request. Two reasons, and either on its own would be
   * enough:
   *
   *  - A missing cookie does not mean a refused password. The fetch standard
   *    says a redirect the caller asked not to follow comes back *opaque* —
   *    no status, no headers — so on a runtime that implements that, there
   *    is nothing to read whether the password was right or not. The value
   *    is derived from the password anyway (`tokenFor`), so it can be
   *    computed instead of read.
   *  - A wrong password would otherwise surface much later, as a 401 from
   *    whatever call happened to be first, which reads like a broken tool
   *    rather than a typo in `.env.local`.
   */
  async enter(email: string, password: string): Promise<void> {
    const response = await this.fetch(`${this.baseUrl}/api/auth/password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      /*
       * One refusal for a wrong password, an address with no account and one
       * nobody invited — the app will not say which, on purpose, so neither
       * can this. What it can do is name the two things to check.
       */
      throw new Error(
        `the app at ${this.baseUrl} would not sign in as ${email} (${String(response.status)}): check OVERTONE_ACCOUNT_EMAIL and OVERTONE_ACCOUNT_PASSWORD, and that the address is in OVERTONE_INVITED`,
      )
    }

    /*
     * Read, never derived. The old shared password hashed to its own cookie
     * value, so a missing `Set-Cookie` could be worked around; these are
     * tokens the service mints, so an absent one is the end of it.
     *
     * Only the name=value pair, never the attributes: `Path` and `HttpOnly`
     * are instructions to a browser, and this is not one.
     */
    const handed = response.headers
      .getSetCookie()
      .filter(
        (cookie) => cookie.startsWith(`${ACCESS_COOKIE}=`) || cookie.startsWith(`${REFRESH_COOKIE}=`),
      )
      .map((cookie) => cookie.split(';')[0] ?? '')
      .filter((pair) => pair.length > 0)

    if (handed.length === 0) {
      throw new Error(
        `the app at ${this.baseUrl} accepted the sign-in but handed back no session cookie`,
      )
    }

    this.cookie = handed.join('; ')

    // Proved rather than assumed, with one cheap authenticated request: a
    // session that does not work should fail here and not as a puzzling 401
    // from whatever call happens to be first.
    try {
      await this.pending()
    } catch (error) {
      this.cookie = undefined
      throw new Error(
        `the app at ${this.baseUrl} signed in but would not answer an authenticated request (${error instanceof Error ? error.message : String(error)})`,
      )
    }
  }

  private async send(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    if (this.cookie === undefined) {
      throw new Error('not signed in yet — call enter() first')
    }

    const response = await this.fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), cookie: this.cookie },
    })

    const payload = await readJson(response)

    /*
     * The app reports a refusal as a rendered sentence in `error`, in the
     * locale it was asked in, so it is passed through rather than
     * interpreted. Interpreting it would mean matching on text, which is
     * the one thing no layer below the presenter is allowed to do.
     */
    if (!response.ok || payload['error'] !== undefined) {
      throw new Error(String(payload['error'] ?? `${String(response.status)} refused`))
    }

    return payload
  }

  private json(path: string, body: unknown): Promise<Record<string, unknown>> {
    return this.send(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  /** Creates the episode and hands back a signed URL per chunk. */
  async start(request: StartRequest): Promise<StartedEpisode> {
    const started = await this.json('/api/episodes/start', {
      durationMs: request.durationMs,
      // Whole, extension included: the server reads a presentable title and
      // the episode number out of it.
      title: request.fileName,
      audioDigest: request.audioDigest,
      locale: request.locale,
    })

    return {
      episodeId: String(started['episodeId']),
      chunks: (started['chunks'] ?? []) as readonly ChunkTarget[],
      alreadyHave: started['alreadyHave'] === true,
      title: typeof started['title'] === 'string' ? started['title'] : '',
    }
  }

  /**
   * Where the seams actually landed, before a single byte is uploaded.
   *
   * Throwing when it is refused is the point. The audio is cut on these, so
   * an episode whose boundaries were never recorded is offset by the planned
   * ones instead — every timestamp after a seam wrong, every number still
   * looking reasonable. A failed upload is the cheap outcome.
   */
  async recordBoundaries(episodeId: string, startsMs: readonly number[]): Promise<void> {
    await this.json('/api/episodes/boundaries', { episodeId, startsMs })
  }

  /** Every episode the app holds, with how far each one got. */
  async list(): Promise<readonly LibraryEpisode[]> {
    const payload = await this.send('/api/episodes/list')

    return (payload['episodes'] ?? []) as readonly LibraryEpisode[]
  }

  /** The episode being transcribed right now, if there is one. */
  async pending(): Promise<PendingEpisode | undefined> {
    const payload = await this.send('/api/episodes/pending')
    const episode = payload['episode']

    return episode === null || episode === undefined
      ? undefined
      : (episode as PendingEpisode)
  }

  /**
   * Removes an episode and its audio for good.
   *
   * For a half-uploaded one: signed URLs last fifteen minutes, and an
   * episode whose URLs expired mid-upload holds storage that nothing will
   * ever transcribe, on a tier of about a gigabyte. Never for one with a
   * transcript — that audio was paid for out of a daily allowance holding
   * three episodes.
   */
  async forget(episodeId: string): Promise<void> {
    await this.send(`/api/episodes/list?id=${encodeURIComponent(episodeId)}`, {
      method: 'DELETE',
    })
  }
}
