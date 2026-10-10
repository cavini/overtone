import { groupIntoMoments } from '../analysis/moments.js'
import type { TranscriptMatch, TranscriptSearch } from '../ports/transcript-search.js'

/**
 * Enough rows to find the conversations, not enough to list every mention.
 *
 * A word said four hundred times does not need four hundred rows to show
 * someone where it was discussed — the moments collapse to a handful either
 * way, and the rest is work nobody reads.
 */
const MATCH_LIMIT = 300

export interface SearchTranscriptsRequest {
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
export async function searchTranscripts(
  request: SearchTranscriptsRequest,
  deps: SearchTranscriptsDependencies,
): Promise<FoundMoment[]> {
  const query = request.query.trim()

  // A blank query is not a question, so it is not asked.
  if (query.length === 0) return []

  const matches = await deps.search.search(query, MATCH_LIMIT)

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

  // The longest discussion first, whichever episode it happened in.
  return found.sort((a, b) => b.hitCount - a.hitCount || a.episodeNumber - b.episodeNumber)
}
