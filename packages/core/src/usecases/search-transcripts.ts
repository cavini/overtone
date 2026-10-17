import { groupIntoMoments } from '../analysis/moments.js'
import type { TranscriptMatch, TranscriptSearch } from '../ports/transcript-search.js'

/**
 * Enough rows per episode to find the conversations in it.
 *
 * A word said four hundred times does not need four hundred rows to show
 * someone where it was discussed — the moments collapse to a handful either
 * way, and the rest is work nobody reads.
 *
 * Per episode, not across the library. One flat budget was spent
 * busiest-episode-first, so a word said constantly filled every row from a
 * single episode and the rest of the series simply did not appear. Twenty
 * lines is several moments once they are grouped, and fifteen episodes of
 * it is the same work the flat three hundred was.
 */
const MATCHES_PER_EPISODE = 20

export interface SearchTranscriptsRequest {
  /** Whose library to look in. Never optional — see the port. */
  readonly seriesId: string
  readonly query: string
}

export interface SearchTranscriptsDependencies {
  readonly search: TranscriptSearch
}

/** One stretch of one episode that was about the thing. */
export interface FoundMoment {
  readonly episodeId: string
  readonly episodeNumber: number
  readonly episodeTitle: string
  readonly startMs: number
  readonly endMs: number
  /** How much of the moment was about it. */
  readonly hitCount: number
  /**
   * What was said, with the matching words wrapped in `MATCH_OPEN` and
   * `MATCH_CLOSE`.
   *
   * Marked by the database, which is the only layer that knows why a
   * segment matched — the search stems, so `ano` matches `anos`. The page
   * splits on the markers and emits its own elements.
   */
  readonly quote: string
}

/**
 * Finds the moments someone is thinking of.
 *
 * The database finds segments; this decides what a *moment* is. Segments run
 * about three seconds, so a conversation produces a cluster of them, and
 * handing back the cluster would answer "where was this discussed" with a
 * column of timestamps two seconds apart.
 *
 * Grouped per episode before anything else: moments are gathered by how
 * close together they are in time, and every episode has a minute forty.
 * Grouping a flat list would merge a conversation in one episode with an
 * unrelated one in another and report a moment that never happened.
 */
/** What a search found, and how much of it is on the page. */
export interface SearchResult {
  readonly moments: FoundMoment[]
  /**
   * Lines that matched across the library — not how many are shown.
   *
   * Counted from each episode's own total, so it is the real figure rather
   * than the size of the sample.
   */
  readonly matchCount: number
  /** Whether any episode held more matches than came back. */
  readonly sampled: boolean
}

export async function searchTranscripts(
  request: SearchTranscriptsRequest,
  deps: SearchTranscriptsDependencies,
): Promise<SearchResult> {
  const query = request.query.trim()

  // A blank query is not a question, so it is not asked.
  if (query.length === 0) return { moments: [], matchCount: 0, sampled: false }

  const matches = await deps.search.search(request.seriesId, query, MATCHES_PER_EPISODE)

  const byEpisode = new Map<string, TranscriptMatch[]>()
  for (const match of matches) {
    byEpisode.set(match.episodeId, [...(byEpisode.get(match.episodeId) ?? []), match])
  }

  const found: FoundMoment[] = []

  for (const episodeMatches of byEpisode.values()) {
    const first = episodeMatches[0]
    /* c8 ignore next -- a map entry always has the match that created it. */
    if (first === undefined) continue

    for (const moment of groupIntoMoments(episodeMatches)) {
      const inside = episodeMatches
        .filter((match) => match.startMs >= moment.startMs && match.endMs <= moment.endMs)
        .sort((a, b) => a.startMs - b.startMs)

      found.push({
        episodeId: first.episodeId,
        episodeNumber: first.episodeNumber,
        episodeTitle: first.episodeTitle,
        startMs: moment.startMs,
        endMs: moment.endMs,
        hitCount: moment.hitCount,
        quote: inside.map((match) => match.highlighted.trim()).join(' ').trim(),
      })
    }
  }

  /*
   * Counted per episode and summed, because every match of an episode
   * carries that episode's total — reading it off one row each is the figure,
   * while adding them all up would multiply it by the sample size.
   */
  let matchCount = 0
  let sampled = false
  for (const episodeMatches of byEpisode.values()) {
    const first = episodeMatches[0]
    /* c8 ignore next -- a map entry always has the match that created it. */
    if (first === undefined) continue

    matchCount += first.episodeMatches
    if (first.episodeMatches > episodeMatches.length) sampled = true
  }

  return {
    // The longest discussion first, whichever episode it happened in.
    moments: found.sort((a, b) => b.hitCount - a.hitCount || a.episodeNumber - b.episodeNumber),
    matchCount,
    sampled,
  }
}
