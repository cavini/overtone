// The app's own HTTP API, spoken by a program instead of a tab.
//
// Every one of these calls is the one the browser makes, in the order the
// browser makes them. That is the point of the tool: a second upload path
// would be a second chance to get the chunk boundaries wrong, and the
// boundaries are the thing in this repo that fails silently.
//
// `fetch` is injected, so nothing here touches a network.
import { beforeEach, describe, expect, it } from 'vitest'
import { OvertoneApi } from './overtone-api.js'

interface Call {
  readonly url: string
  readonly method: string
  readonly headers: Record<string, string>
  readonly body: string
}

let calls: Call[]
let answers: Response[]

const jsonBody = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

/** What a correct email and password get back: 200, and two cookies. */
const entered = (): Response =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: [
      ['content-type', 'application/json'],
      ['set-cookie', 'overtone_access=access-abc; Path=/; HttpOnly; SameSite=Lax'],
      ['set-cookie', 'overtone_refresh=refresh-abc; Path=/; HttpOnly; SameSite=Lax'],
    ],
  })

/**
 * What a wrong one gets back.
 *
 * The same 401 for a wrong password, an address with no account and one
 * nobody invited — the app will not say which, so this fixture is all three.
 */
const refused = (): Response =>
  new Response(JSON.stringify({ error: 'WRONG_EMAIL_OR_PASSWORD' }), { status: 401 })

/** What the app answers a session it does not recognise. */
const unauthorised = (): Response =>
  new Response(JSON.stringify({ error: 'NOT_SIGNED_IN' }), { status: 401 })

/** Accepted, but with no session attached — nothing to carry onward. */
const cookieless = (): Response =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

/**
 * The two answers getting in costs: the cookie, and the authenticated
 * request that proves it works. See `enter`.
 */
const door = (): Response[] => [entered(), jsonBody({ episode: null })]

const stubFetch = (async (url: string | URL, init: RequestInit = {}) => {
  const headers = new Headers(init.headers ?? {})
  calls.push({
    url: String(url),
    method: init.method ?? 'GET',
    headers: Object.fromEntries(headers.entries()),
    body: typeof init.body === 'string' ? init.body : String(init.body ?? ''),
  })

  return answers.shift() ?? jsonBody({})
}) as unknown as typeof globalThis.fetch

const apiOf = () =>
  new OvertoneApi({ baseUrl: 'https://overtone.example', fetch: stubFetch })

beforeEach(() => {
  calls = []
  answers = []
})

describe('getting in', () => {
  it('posts the address and password as json', async () => {
    answers = [entered()]

    await apiOf().enter('dex@example.test', 'uma senha comprida')

    expect(calls[0]?.url).toBe('https://overtone.example/api/auth/password')
    expect(calls[0]?.method).toBe('POST')
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({
      email: 'dex@example.test',
      password: 'uma senha comprida',
    })
  })

  /*
   * Both cookies. The access token is what authenticates, and the refresh
   * token is what the app renews it from — a run lasts days and the access
   * token lasts an hour, so dropping the refresh would sign the tool out
   * mid-catalogue.
   */
  it('carries both session cookies into every later call', async () => {
    answers = [...door(), jsonBody({ episodes: [] })]
    const api = apiOf()

    await api.enter('dex@example.test', 'uma senha comprida')
    await api.list()

    expect(calls[2]?.headers['cookie']).toContain('overtone_access=access-abc')
    expect(calls[2]?.headers['cookie']).toContain('overtone_refresh=refresh-abc')
  })

  // Only the pair, never `Path` or `HttpOnly`: those are instructions to a
  // browser, and this is not one.
  it('sends no cookie attributes', async () => {
    answers = [...door(), jsonBody({ episodes: [] })]
    const api = apiOf()

    await api.enter('dex@example.test', 'uma senha comprida')
    await api.list()

    expect(calls[2]?.headers['cookie']).not.toMatch(/Path|HttpOnly|SameSite/u)
  })

  /*
   * One refusal covers a wrong password, an address with no account and one
   * nobody invited — the app will not say which, on purpose. So the message
   * names what to check instead of guessing which it was.
   */
  it('says the sign-in was refused, and what to check', async () => {
    answers = [refused()]

    await expect(apiOf().enter('dex@example.test', 'errada')).rejects.toThrow(
      /OVERTONE_ACCOUNT_EMAIL.*OVERTONE_INVITED/su,
    )
  })

  /*
   * No way around a missing cookie any more. The shared password hashed to
   * its own cookie value, so one could be computed when the runtime hid the
   * response; these are tokens the service mints, and an absent one is the
   * end of it. Better to say so than to send no cookie and read a 401 later.
   */
  it('says so when it is let in with no session attached', async () => {
    answers = [cookieless()]

    await expect(apiOf().enter('dex@example.test', 'uma senha comprida')).rejects.toThrow(
      /handed back no session cookie/u,
    )
  })

  /*
   * Proved, not assumed. A session that does not work would otherwise
   * surface as a 401 from whatever call happened to be first, which reads
   * like a broken tool rather than a credential problem.
   */
  it('checks the session works before doing anything with it', async () => {
    answers = [entered(), unauthorised()]

    await expect(
      apiOf().enter('dex@example.test', 'uma senha comprida'),
    ).rejects.toThrow(/NOT_SIGNED_IN/u)
    expect(calls[1]?.url).toBe('https://overtone.example/api/episodes/pending')
  })

  it('refuses to do anything before it has been let in', async () => {
    await expect(apiOf().list()).rejects.toThrow(/enter/u)
  })
})

describe('starting an episode', () => {
  const start = async () => {
    answers = [
      ...door(),
      jsonBody({
        episodeId: 'ep-1',
        chunks: [
          { index: 0, startMs: 0, endMs: 600_000, uploadUrl: 'https://store.example/0' },
          { index: 1, startMs: 600_000, endMs: 900_000, uploadUrl: 'https://store.example/1' },
        ],
        chunkCount: 2,
        alreadyHave: false,
        title: 'Chuva de canivetes #001',
      }),
    ]

    const api = apiOf()
    await api.enter('dex@example.test', 'uma senha comprida')

    return api.start({
      durationMs: 900_000,
      fileName: 'chuva-de-canivetes-001.mp3',
      audioDigest: 'deadbeef',
      locale: 'pt',
    })
  }

  // The filename goes in the `title` field. It looks wrong and it is not:
  // the server reads the programme and the number out of it.
  it('sends the filename, the duration and the fingerprint', async () => {
    await start()

    const sent = JSON.parse(calls[2]?.body ?? '{}') as Record<string, unknown>
    expect(calls[2]?.url).toBe('https://overtone.example/api/episodes/start')
    expect(sent).toEqual({
      durationMs: 900_000,
      title: 'chuva-de-canivetes-001.mp3',
      audioDigest: 'deadbeef',
      locale: 'pt',
    })
  })

  it('hands back where each chunk goes', async () => {
    const started = await start()

    expect(started.episodeId).toBe('ep-1')
    expect(started.chunks.map((chunk) => chunk.uploadUrl)).toEqual([
      'https://store.example/0',
      'https://store.example/1',
    ])
    expect(started.alreadyHave).toBe(false)
  })

  /*
   * The same audio under another name. Not an error and not something to
   * retry: re-transcribing a two-hour episode spends about a third of a
   * day's free allowance to arrive at the transcript already in the
   * database, so the caller skips it.
   */
  it('reports an episode the app already has', async () => {
    answers = [
      ...door(),
      jsonBody({ episodeId: 'ep-old', chunks: [], alreadyHave: true, title: 'Chuva de canivetes #001' }),
    ]
    const api = apiOf()
    await api.enter('dex@example.test', 'uma senha comprida')

    const started = await api.start({
      durationMs: 900_000,
      fileName: 'chuva-de-canivetes-001.mp3',
      audioDigest: 'deadbeef',
      locale: 'pt',
    })

    expect(started.alreadyHave).toBe(true)
    expect(started.title).toBe('Chuva de canivetes #001')
  })

  it('passes on what the server refused it for', async () => {
    answers = [
      ...door(),
      new Response(JSON.stringify({ error: 'O episódio é longo demais' }), { status: 413 }),
    ]
    const api = apiOf()
    await api.enter('dex@example.test', 'uma senha comprida')

    await expect(
      api.start({
        durationMs: 99_999_999,
        fileName: 'chuva-de-canivetes-001.mp3',
        audioDigest: 'deadbeef',
        locale: 'pt',
      }),
    ).rejects.toThrow(/longo demais/u)
  })

  /*
   * A body too large or a function that timed out comes back as HTML, and
   * `response.json()` throws on it. Unhandled, that surfaced in the browser
   * as "the file may be corrupt", which sent everyone looking at the audio
   * instead of at the request.
   */
  it('says what it got when the answer is not json at all', async () => {
    answers = [...door(), new Response('<html>Request Entity Too Large</html>', { status: 413 })]
    const api = apiOf()
    await api.enter('dex@example.test', 'uma senha comprida')

    await expect(
      api.start({
        durationMs: 1,
        fileName: 'x-001.mp3',
        audioDigest: 'd',
        locale: 'pt',
      }),
    ).rejects.toThrow(/413/u)
  })
})

describe('recording where the seams landed', () => {
  const api = async () => {
    const made = apiOf()
    answers = [...door(), ...answers]
    await made.enter('dex@example.test', 'uma senha comprida')
    return made
  }

  it('posts the settled boundaries for the episode', async () => {
    answers = [jsonBody({ ok: true })]

    await (await api()).recordBoundaries('ep-1', [0, 601_000])

    expect(calls[2]?.url).toBe('https://overtone.example/api/episodes/boundaries')
    expect(JSON.parse(calls[2]?.body ?? '{}')).toEqual({
      episodeId: 'ep-1',
      startsMs: [0, 601_000],
    })
  })

  /*
   * Refused is not something to shrug at. The audio is about to be cut on
   * these boundaries, so an episode whose boundaries were not recorded
   * would be offset by the planned ones instead — every timestamp after a
   * seam wrong, and every number still looking reasonable.
   */
  it('throws when the server will not take them', async () => {
    answers = [new Response(JSON.stringify({ error: 'ALREADY_STARTED' }), { status: 409 })]

    await expect((await api()).recordBoundaries('ep-1', [0, 601_000])).rejects.toThrow(
      /ALREADY_STARTED/u,
    )
  })
})

describe('asking what the app already has', () => {
  const api = async () => {
    const made = apiOf()
    answers = [...door(), ...answers]
    await made.enter('dex@example.test', 'uma senha comprida')
    return made
  }

  it('reads the library', async () => {
    answers = [
      jsonBody({
        episodes: [
          {
            episodeId: 'ep-2',
            number: 2,
            title: 'Chuva de Canivetes #002',
            durationMs: 7_000_000,
            status: 'ready',
            chunksDone: 12,
            chunkCount: 12,
          },
        ],
      }),
    ]

    const library = await (await api()).list()

    expect(calls[2]?.url).toBe('https://overtone.example/api/episodes/list')
    expect(library).toHaveLength(1)
    expect(library[0]?.status).toBe('ready')
    expect(library[0]?.title).toBe('Chuva de Canivetes #002')
  })

  it('reads the episode still being transcribed', async () => {
    answers = [
      jsonBody({
        episode: {
          episodeId: 'ep-3',
          title: 'Chuva de Canivetes #003',
          chunksDone: 4,
          chunkCount: 13,
          live: true,
        },
      }),
    ]

    const pending = await (await api()).pending()

    expect(calls[2]?.url).toBe('https://overtone.example/api/episodes/pending')
    expect(pending?.chunksDone).toBe(4)
    expect(pending?.live).toBe(true)
  })

  it('reads nothing in flight as nothing', async () => {
    answers = [jsonBody({ episode: null })]

    expect(await (await api()).pending()).toBeUndefined()
  })

  /*
   * Deleting is how a half-uploaded episode is cleaned up: a signed upload
   * URL lasts fifteen minutes, and an episode whose URLs expired holds
   * storage nothing will ever transcribe. The route takes the id in the
   * query string.
   */
  it('deletes an episode by id', async () => {
    answers = [jsonBody({ ok: true })]

    await (await api()).forget('ep-1')

    expect(calls[2]?.url).toBe('https://overtone.example/api/episodes/list?id=ep-1')
    expect(calls[2]?.method).toBe('DELETE')
  })
})

describe('on its own', () => {
  // The real `fetch` when none is handed in, which is how `main.ts` builds
  // it. Nothing is requested here: it refuses before it would.
  it('uses the platform fetch by default', async () => {
    const api = new OvertoneApi({ baseUrl: 'https://overtone.example/' })

    await expect(api.list()).rejects.toThrow(/enter/u)
  })

  // A trailing slash on the base URL would otherwise produce
  // `//api/episodes/list`, which is a different host to a URL parser.
  it('does not mind a trailing slash on the base url', async () => {
    answers = [...door(), jsonBody({ episodes: [] })]
    const api = new OvertoneApi({ baseUrl: 'https://overtone.example/', fetch: stubFetch })

    await api.enter('dex@example.test', 'uma senha comprida')
    await api.list()

    expect(calls[2]?.url).toBe('https://overtone.example/api/episodes/list')
  })

  /*
   * A refusal with no message in it. The app renders a sentence into
   * `error` for everything it refuses on purpose, so a bare status is
   * something unplanned — and "500 refused" is at least a status.
   */
  it('says the status when the server refused without a reason', async () => {
    answers = [...door(), new Response(JSON.stringify({}), { status: 500 })]
    const api = apiOf()
    await api.enter('dex@example.test', 'uma senha comprida')

    await expect(api.list()).rejects.toThrow(/500/u)
  })

  // A response that is JSON but holds none of what was asked for. Better an
  // episode with no chunks, which fails visibly, than a crash in the parser.
  it('does not fall over on an answer missing its fields', async () => {
    answers = [...door(), jsonBody({ episodeId: 'ep-1' })]
    const api = apiOf()
    await api.enter('dex@example.test', 'uma senha comprida')

    const started = await api.start({
      durationMs: 1_000,
      fileName: 'x-001.mp3',
      audioDigest: 'd',
      locale: 'pt',
    })

    expect(started.chunks).toEqual([])
    expect(started.title).toBe('')
  })
})
