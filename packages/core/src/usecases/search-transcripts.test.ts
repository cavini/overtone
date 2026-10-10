// US-047
import { describe, expect, it, vi } from 'vitest'
import type { TranscriptMatch } from '../ports/transcript-search.js'
import { searchTranscripts } from './search-transcripts.js'

const match = (
  episodeNumber: number,
  startMs: number,
  text = 'falamos do cachorro',
  highlighted = text,
): TranscriptMatch => ({
  episodeId: `ep-${episodeNumber}`,
  episodeNumber,
  episodeTitle: `Episódio ${episodeNumber}`,
  startMs,
  endMs: startMs + 3_000,
  text,
  highlighted,
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

    expect(await searchTranscripts({ seriesId: SERIES, query: '   ' }, { search })).toEqual([])
    // Not even asked: a blank query is not a question.
    expect(search.search).not.toHaveBeenCalled()
  })

  it('gathers a cluster in one episode into a single moment', async () => {
    const found = await searchTranscripts(
      { seriesId: SERIES, query: 'cachorro' },
      { search: searching([match(1, 0), match(1, 4_000), match(1, 9_000)]) },
    )

    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ episodeNumber: 1, hitCount: 3, startMs: 0 })
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

    expect(found).toHaveLength(2)
    expect(found.map((moment) => moment.episodeNumber).sort()).toEqual([3, 7])
  })

  // The marks come from the database, which is the only layer that knows
  // which words made the segment match.
  it('carries the marked-up text through, not the plain text', async () => {
    const found = await searchTranscripts(
      { seriesId: SERIES, query: 'cachorro' },
      { search: searching([match(1, 0, 'o cachorro', `o \u0002cachorro\u0003`)]) },
    )

    expect(found[0]?.quote).toBe(`o \u0002cachorro\u0003`)
  })

  it('shows what was said, so the reader can see why it matched', async () => {
    const found = await searchTranscripts(
      { seriesId: SERIES, query: 'cachorro' },
      { search: searching([match(1, 0, 'o cachorro do Dex')]) },
    )

    expect(found[0]?.quote).toContain('cachorro')
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

    expect(found[0]?.quote).toBe('o cachorro do Dex')
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

    expect(found[0]).toMatchObject({ episodeNumber: 9, hitCount: 3 })
  })

  it('carries the episode through so a result can be opened', async () => {
    const found = await searchTranscripts({ seriesId: SERIES, query: 'x' }, { search: searching([match(4, 0)]) })

    expect(found[0]).toMatchObject({ episodeId: 'ep-4', episodeTitle: 'Episódio 4' })
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
