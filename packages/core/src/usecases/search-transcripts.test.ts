// US-047
import { describe, expect, it, vi } from 'vitest'
import type { TranscriptMatch } from '../ports/transcript-search.js'
import { searchTranscripts } from './search-transcripts.js'

const match = (
  episodeNumber: number,
  startMs: number,
  text = 'falamos do cachorro',
  highlighted = text,
  /** How many lines matched in that episode in all, not just here. */
  episodeMatches = 1,
): TranscriptMatch => ({
  episodeId: `ep-${episodeNumber}`,
  episodeNumber,
  episodeTitle: `Episódio ${episodeNumber}`,
  startMs,
  endMs: startMs + 3_000,
  text,
  highlighted,
  episodeMatches,
})

/** Whose library is being searched. Required by the port, never optional. */
const SERIES = 'series-1'

const searching = (matches: readonly TranscriptMatch[]) => ({
  // Typed parameters so a test can read back what it was asked for.
  search: vi.fn((_seriesId: string, _query: string, _limit: number) => Promise.resolve(matches)),
})

describe('searchTranscripts', () => {
  it('finds nothing for a query with no words in it', async () => {
    const search = searching([match(1, 0)])

    expect((await searchTranscripts({ seriesId: SERIES, query: '   ' }, { search })).moments).toEqual([])
    // Not even asked: a blank query is not a question.
    expect(search.search).not.toHaveBeenCalled()
  })

  it('gathers a cluster in one episode into a single moment', async () => {
    const found = await searchTranscripts(
      { seriesId: SERIES, query: 'cachorro' },
      { search: searching([match(1, 0), match(1, 4_000), match(1, 9_000)]) },
    )

    expect(found.moments).toHaveLength(1)
    expect(found.moments[0]).toMatchObject({ episodeNumber: 1, hitCount: 3, startMs: 0 })
  })

  /*
   * The hazard worth a test of its own.
   *
   * Moments are grouped by how close together they are in time, and two
   * different episodes both have a minute 40. Grouping a flat list would
   * merge a conversation in episode 3 with an unrelated one in episode 7
   * and report a moment that never happened.
   */
  it('never merges two episodes that happen to share a timestamp', async () => {
    const found = await searchTranscripts(
      { seriesId: SERIES, query: 'cachorro' },
      { search: searching([match(3, 2_400_000), match(7, 2_401_000)]) },
    )

    expect(found.moments).toHaveLength(2)
    expect(found.moments.map((moment) => moment.episodeNumber).sort()).toEqual([3, 7])
  })

  // The marks come from the database, which is the only layer that knows
  // which words made the segment match.
  it('carries the marked-up text through, not the plain text', async () => {
    const found = await searchTranscripts(
      { seriesId: SERIES, query: 'cachorro' },
      { search: searching([match(1, 0, 'o cachorro', `o \u0002cachorro\u0003`)]) },
    )

    expect(found.moments[0]?.quote).toBe(`o \u0002cachorro\u0003`)
  })

  it('shows what was said, so the reader can see why it matched', async () => {
    const found = await searchTranscripts(
      { seriesId: SERIES, query: 'cachorro' },
      { search: searching([match(1, 0, 'o cachorro do Dex')]) },
    )

    expect(found.moments[0]?.quote).toContain('cachorro')
  })

  it('joins up the words of a moment that spans several segments', async () => {
    const found = await searchTranscripts(
      { seriesId: SERIES, query: 'cachorro' },
      {
        search: searching([
          match(1, 0, 'o cachorro'),
          match(1, 4_000, 'do Dex'),
        ]),
      },
    )

    expect(found.moments[0]?.quote).toBe('o cachorro do Dex')
  })

  // The longest discussion is the one someone means, whichever episode it
  // happened in.
  it('puts the biggest moment first across all episodes', async () => {
    const found = await searchTranscripts(
      { seriesId: SERIES, query: 'cachorro' },
      {
        search: searching([
          match(1, 0),
          match(9, 600_000),
          match(9, 604_000),
          match(9, 608_000),
        ]),
      },
    )

    expect(found.moments[0]).toMatchObject({ episodeNumber: 9, hitCount: 3 })
  })

  it('carries the episode through so a result can be opened', async () => {
    const found = await searchTranscripts({ seriesId: SERIES, query: 'x' }, { search: searching([match(4, 0)]) })

    expect(found.moments[0]).toMatchObject({ episodeId: 'ep-4', episodeTitle: 'Episódio 4' })
  })

  it('asks for a bounded number of rows', async () => {
    const search = searching([])
    await searchTranscripts({ seriesId: SERIES, query: 'cachorro' }, { search })

    const [, , limit] = search.search.mock.calls[0] ?? []
    expect(limit).toBeGreaterThan(0)
    expect(limit).toBeLessThanOrEqual(500)
  })

  it('passes the query along as the person typed it', async () => {
    const search = searching([])
    await searchTranscripts({ seriesId: SERIES, query: '  cachorro do Dex ' }, { search })

    expect(search.search.mock.calls[0]?.[1]).toBe('cachorro do Dex')
  })

  /*
   * The scope is an argument, not a filter somebody remembers. Search reads
   * every stored segment there is, so an unscoped one is a person reading
   * somebody else's transcripts.
   */
  it('asks only within the library it was given', async () => {
    const search = searching([match(1, 0)])
    await searchTranscripts({ seriesId: SERIES, query: 'cachorro' }, { search })

    expect(search.search.mock.calls[0]?.[0]).toBe(SERIES)
  })
})

/*
 * A search that shows part of the answer has to say so. The per-episode
 * budget samples across each episode, so a word said 2,500 times comes back
 * as a few hundred moments — and without a count, nothing on the page
 * distinguishes that from "that is all there is".
 */
describe('saying how much was found', () => {
  it('counts every matching line, not the ones it shows', async () => {
    const found = await searchTranscripts(
      { seriesId: SERIES, query: 'cachorro' },
      {
        search: searching([
          match(1, 0, 'falamos do cachorro', 'falamos do cachorro', 321),
          match(1, 600_000, 'falamos do cachorro', 'falamos do cachorro', 321),
          match(2, 0, 'falamos do cachorro', 'falamos do cachorro', 4),
        ]),
      },
    )

    // 321 in the first episode and 4 in the second, counted once each.
    expect(found.matchCount).toBe(325)
  })

  it('says it is a sample when an episode held more than came back', async () => {
    const found = await searchTranscripts(
      { seriesId: SERIES, query: 'cachorro' },
      { search: searching([match(1, 0, 'x', 'x', 321)]) },
    )

    expect(found.sampled).toBe(true)
  })

  it('does not say so when everything came back', async () => {
    const found = await searchTranscripts(
      { seriesId: SERIES, query: 'cachorro' },
      { search: searching([match(1, 0, 'x', 'x', 2), match(1, 600_000, 'x', 'x', 2)]) },
    )

    expect(found.sampled).toBe(false)
    expect(found.matchCount).toBe(2)
  })

  it('has nothing to count for a query with no words', async () => {
    const found = await searchTranscripts(
      { seriesId: SERIES, query: '  ' },
      { search: searching([match(1, 0)]) },
    )

    expect(found).toEqual({ moments: [], matchCount: 0, sampled: false })
  })
})
