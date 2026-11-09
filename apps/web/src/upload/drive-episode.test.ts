// US-002 · ADR 0027
//
// The pacing loop, with the browser taken out of it. This is the part that
// decides whether an episode finishes, stalls, or reports a number nobody
// can act on, and until now it lived inside a 486-line component with no
// test of any kind.
import { describe, expect, it, vi } from 'vitest'
import { driveEpisode, type DriveState } from './drive-episode.js'

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

/** Answers each call from a queue, so a test scripts a whole conversation. */
const answering = (...bodies: Response[]) => {
  const queue = [...bodies]
  return vi.fn(() => Promise.resolve(queue.shift() ?? ok({ status: { done: true } })))
}

const collect = () => {
  const states: DriveState[] = []
  const errors: string[] = []
  const settled: string[] = []
  return {
    states,
    errors,
    settled,
    handlers: {
      onState: (state: DriveState) => void states.push(state),
      onResult: () => {},
      onError: (message: string) => void errors.push(message),
      onSettled: (episodeId: string) => void settled.push(episodeId),
    },
  }
}

const deps = (fetchImpl: ReturnType<typeof answering>) => ({
  fetch: fetchImpl as unknown as typeof globalThis.fetch,
  sleep: () => Promise.resolve(),
  now: () => 1_000,
})

describe('driving an episode to the end', () => {
  it('stops as soon as the episode is done', async () => {
    const seen = collect()
    const calls = answering(ok({ status: { done: true } }))

    await driveEpisode({ episodeId: 'ep1', chunkCount: 3, locale: 'pt' }, seen.handlers, deps(calls))

    expect(calls).toHaveBeenCalledTimes(1)
    expect(seen.states.at(-1)).toEqual({ phase: 'finished' })
  })

  /*
   * The scheduled job and the tab drive the same loop under one lease
   * (ADR 0027), so finding it mid-step is neither an error nor progress. It
   * used to be read as a status, which meant reading `undefined`.
   */
  it('waits and asks again when the schedule holds the lease', async () => {
    const seen = collect()
    const calls = answering(
      ok({ busy: true, retryAfterMs: 3_000 }),
      ok({ status: { done: true } }),
    )

    await driveEpisode({ episodeId: 'ep1', chunkCount: 3, locale: 'pt' }, seen.handlers, deps(calls))

    expect(calls).toHaveBeenCalledTimes(2)
    // A busy answer carries no status, so it must not be reported as one.
    expect(seen.states.some((s) => s.phase === 'finished')).toBe(true)
    expect(seen.errors).toEqual([])
  })

  /*
   * Reported as a phase rather than as a sentence. No layer below the
   * presenter knows which language the reader wants (ADR 0017), and the old
   * version put `labels.waitingForAllowance` straight into this logic.
   */
  it('says it is waiting on the allowance, as a phase and not a sentence', async () => {
    const seen = collect()
    const calls = answering(
      ok({ status: { done: false }, retryAfterMs: 60_000, chunksDone: 1, chunkCount: 4 }),
      ok({ status: { done: true } }),
    )

    await driveEpisode({ episodeId: 'ep1', chunkCount: 4, locale: 'pt' }, seen.handlers, deps(calls))

    const waiting = seen.states.find((s) => s.phase === 'waiting')
    expect(waiting).toEqual({
      phase: 'waiting',
      done: 1,
      total: 4,
      // now() + retryAfterMs, from the injected clock rather than Date.now.
      nextAttemptAt: 61_000,
    })
  })

  it('counts chunks as transcribing while nothing is waiting', async () => {
    const seen = collect()
    const calls = answering(
      ok({ status: { done: false }, chunksDone: 2, chunkCount: 5 }),
      ok({ status: { done: true } }),
    )

    await driveEpisode({ episodeId: 'ep1', chunkCount: 5, locale: 'pt' }, seen.handlers, deps(calls))

    expect(seen.states.find((s) => s.phase === 'transcribing')).toEqual({
      phase: 'transcribing',
      done: 2,
      total: 5,
    })
  })

  // Falls back to the count the caller already knew, so a response that
  // omits it does not reset the bar to zero of zero.
  it('keeps the chunk count it was given when the answer omits one', async () => {
    const seen = collect()
    const calls = answering(
      ok({ status: { done: false }, chunksDone: 1 }),
      ok({ status: { done: true } }),
    )

    await driveEpisode({ episodeId: 'ep1', chunkCount: 7, locale: 'pt' }, seen.handlers, deps(calls))

    expect(seen.states.find((s) => s.phase === 'transcribing')?.total).toBe(7)
  })

  it('reports a refusal and stops asking', async () => {
    const seen = collect()
    const calls = answering(new Response(JSON.stringify({ error: 'STORAGE_FULL' }), { status: 409 }))

    await driveEpisode({ episodeId: 'ep1', chunkCount: 3, locale: 'pt' }, seen.handlers, deps(calls))

    expect(seen.errors).toEqual(['STORAGE_FULL'])
    expect(calls).toHaveBeenCalledTimes(1)
  })

  /*
   * Whatever stopped the loop, nothing more is arriving on its own. The
   * transcript keeps polling for as long as it believes the episode is
   * live, and a finished upload once left a request every five seconds
   * running for as long as the tab stayed open.
   */
  it('settles the episode however it ended', async () => {
    const finished = collect()
    await driveEpisode(
      { episodeId: 'ep1', chunkCount: 1, locale: 'pt' },
      finished.handlers,
      deps(answering(ok({ status: { done: true } }))),
    )
    expect(finished.settled).toEqual(['ep1'])

    const refused = collect()
    await driveEpisode(
      { episodeId: 'ep2', chunkCount: 1, locale: 'pt' },
      refused.handlers,
      deps(answering(new Response('{"error":"NOPE"}', { status: 500 }))),
    )
    expect(refused.settled).toEqual(['ep2'])
  })

  // A platform error comes back as HTML, and `response.json()` throws on it.
  // Unhandled that surfaced as "the file may be corrupt", which sent people
  // looking at their audio instead of at the request.
  it('turns a non-JSON answer into a readable failure', async () => {
    const seen = collect()
    const calls = answering(new Response('<html>Request Entity Too Large</html>', { status: 413 }))

    await driveEpisode({ episodeId: 'ep1', chunkCount: 3, locale: 'pt' }, seen.handlers, deps(calls))

    expect(seen.errors[0]).toContain('413')
    expect(seen.settled).toEqual(['ep1'])
  })
})
