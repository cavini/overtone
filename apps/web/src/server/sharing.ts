import type { EpisodeAnalysis } from '@overtone/core'
import { episodes } from '@overtone/db/schema'
import { and, eq } from 'drizzle-orm'
import { mustOwnEpisode, readAnalysisOf } from './analyse-upload.js'
import { looksLikeShareToken, newShareToken } from './share-token.js'
import { database } from './wiring.js'

/** What a stranger holding the link gets, and the whole of it. */
export interface SharedEpisode {
  readonly title: string
  readonly number: number
  readonly analysis: EpisodeAnalysis
}

/**
 * Starts sharing an episode, or hands back the link it already has.
 *
 * Idempotent on purpose. Pressing the button twice is the ordinary thing to
 * do when somebody loses a link, and minting a second token would leave the
 * first one working with nothing on screen to revoke it with.
 */
export async function shareEpisode(userId: string, episodeId: string): Promise<string> {
  await mustOwnEpisode(userId, episodeId)
  const db = database()

  const [already] = await db
    .select({ token: episodes.shareToken })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .limit(1)

  if (already?.token != null) return already.token

  const token = newShareToken((size) => crypto.getRandomValues(new Uint8Array(size)))
  await db.update(episodes).set({ shareToken: token }).where(eq(episodes.id, episodeId))

  return token
}

/**
 * Stops sharing. The link 404s from the next request.
 *
 * The token is cleared rather than remembered as revoked: there is nothing
 * to learn from a link that used to work, and keeping it would mean a
 * second share minting a token that had already been in somebody's chat.
 */
export async function stopSharing(userId: string, episodeId: string): Promise<void> {
  await mustOwnEpisode(userId, episodeId)

  await database().update(episodes).set({ shareToken: null }).where(eq(episodes.id, episodeId))
}

/** The link an episode currently has, if it has one. */
export async function shareLinkFor(userId: string, episodeId: string): Promise<string | undefined> {
  await mustOwnEpisode(userId, episodeId)

  const [found] = await database()
    .select({ token: episodes.shareToken })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .limit(1)

  return found?.token ?? undefined
}

/**
 * What the holder of a link may see.
 *
 * **Counts and the quotes behind them, never the transcript** (Q17). That
 * is a property of the shape rather than a filter applied to it:
 * `EpisodeAnalysis` has no transcript in it, so there is nothing here to
 * remember to strip. One episode, by its token — no series, no library, no
 * neighbouring episodes, nothing about the account that shared it.
 *
 * Only a `ready` episode. A half-processed one has numbers that are about
 * to change, and a link that showed them would be showing a stranger
 * something wrong.
 */
export async function sharedEpisode(token: string): Promise<SharedEpisode | undefined> {
  // Cheap first, so a bot walking the URL space does not cost a round trip.
  if (!looksLikeShareToken(token)) return undefined

  const [found] = await database()
    .select({
      id: episodes.id,
      title: episodes.title,
      number: episodes.number,
      durationMs: episodes.durationMs,
    })
    .from(episodes)
    .where(and(eq(episodes.shareToken, token), eq(episodes.status, 'ready')))
    .limit(1)

  if (found === undefined) return undefined

  return {
    title: found.title,
    number: found.number,
    analysis: await readAnalysisOf(found.id, found.durationMs),
  }
}
