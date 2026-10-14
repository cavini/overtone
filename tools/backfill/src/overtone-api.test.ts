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

/** The redirect-with-a-cookie that a correct password gets back. */
const entered = (): Response =>
  new Response(null, {
    status: 303,
    headers: [
      ['set-cookie', 'overtone_entry=abc123; Path=/; HttpOnly; SameSite=Lax'],
      ['location', '/pt'],
    ],
  })

/** The redirect a wrong one gets back: same status, no cookie. */
const refused = (): Response =>
  new Response(null, { status: 303, headers: { location: '/pt/entrar?wrong=1' } })

/** What the app answers a session it does not recognise. */
const unauthorised = (): Response =>
  new Response(JSON.stringify({ error: 'NOT_SIGNED_IN' }), { status: 401 })

/** A redirect whose headers the runtime refused to show. */
const opaque = (): Response => new Response(null, { status: 200 })

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
  it('posts the shared password to the door', async () => {
    answers = [entered()]

    await apiOf().enter('hunter2', 'pt')

    expect(calls[0]?.url).toBe('https://overtone.example/api/enter')
    expect(calls[0]?.method).toBe('POST')
    // A form, because that is what the route reads. JSON there is a 400.
    expect(calls[0]?.body).toContain('password=hunter2')
    expect(calls[0]?.body).toContain('locale=pt')
  })

  /*
   * The cookie is the whole purpose of the call, and following the redirect
   * would land on a page — in the wrong-password case, a sign-in page that
   * answers 200 and looks like success.
   */
  it('carries the session cookie into every later call', async () => {
    answers = [...door(), jsonBody({ episodes: [] })]
    const api = apiOf()

    await api.enter('hunter2', 'pt')
    await api.list()

    expect(calls[2]?.headers['cookie']).toBe('overtone_entry=abc123')
  })

  /*
   * A wrong password and an unconfigured one both answer 303 to the sign-in
   * page — deliberately, so the response says nothing about which passwords
   * are close. From out here the only signal is the missing cookie, and
   * without this check the first real call would fail as a confusing 401.
   */
  it('says the password was refused rather than failing later', async () => {
    answers = [refused(), unauthorised()]

    await expect(apiOf().enter('wrong', 'pt')).rejects.toThrow(/password/u)
  })

  /*
   * The fetch standard says a redirect the caller asked not to follow comes
   * back opaque — no status, no headers — so on a runtime that implements
   * that there is no cookie to read even when the password was right. Its
   * value is derived from the password, so it is computed instead.
   */
  it('works even when the runtime hides the redirect it was told not to follow', async () => {
    // An opaque redirect cannot be built with the Response constructor —
    // that is rather the point of it — so this stands in for it: an answer
    // with nothing readable in it.
    answers = [opaque(), jsonBody({ episode: null }), jsonBody({ episodes: [] })]
    const api = apiOf()

    await api.enter('hunter2', 'pt')
    await api.list()

    expect(calls[2]?.headers['cookie']).toMatch(/^overtone_entry=[0-9a-f]{64}$/u)
  })

  /*
   * Proved, not assumed. A wrong password would otherwise surface as a 401
   * from whatever call happened to be first, which reads like a broken tool
   * rather than a typo in .env.local.
   */
  it('checks the session works before doing anything with it', async () => {
    answers = [entered(), unauthorised()]

    await expect(apiOf().enter('hunter2', 'pt')).rejects.toThrow(/NOT_SIGNED_IN/u)
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
    await api.enter('hunter2', 'pt')

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
    await api.enter('hunter2', 'pt')

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
    await api.enter('hunter2', 'pt')

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
    await api.enter('hunter2', 'pt')

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
    await made.enter('hunter2', 'pt')
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
    await made.enter('hunter2', 'pt')
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

    await api.enter('hunter2', 'pt')
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
    await api.enter('hunter2', 'pt')

    await expect(api.list()).rejects.toThrow(/500/u)
  })

  // A response that is JSON but holds none of what was asked for. Better an
  // episode with no chunks, which fails visibly, than a crash in the parser.
  it('does not fall over on an answer missing its fields', async () => {
    answers = [...door(), jsonBody({ episodeId: 'ep-1' })]
    const api = apiOf()
    await api.enter('hunter2', 'pt')

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
