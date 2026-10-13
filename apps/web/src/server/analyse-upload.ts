import {
  advanceEpisode,
  DAILY_ALLOWANCE_MS,
  planChunks,
  type AudioChunk,
  asAudioLanguage,
  readEpisodeName,
  type PublishedEpisode,
  type AudioLanguage,
  planFromTranscripts,
  type AdvanceEpisodeOutcome,
  type EpisodeAnalysis,
  type UploadedChunk,
  VOCABULARY_VERSION,
} from '@overtone/core'
import {
  chunkTranscripts,
  episodes,
  insights,
  mentions,
  series,
  seriesMembers,
  termCounts,
  topics,
  transcripts,
} from '@overtone/db/schema'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { DrizzleAllowanceStore, DrizzleChunkStore } from '@overtone/db/repositories'
import { isAbandoned } from './abandoned.js'
import { topicsOfSeries } from './topics.js'
import { blobStore, database, episodeDirectory, pipelineDependencies } from './wiring.js'

/**
 * How long a signed URL has to stay good.
 *
 * Long enough for the provider to fetch a chunk and transcribe it, short
 * enough that a leaked URL is worthless by the time anyone finds it.
 */
const AUDIO_URL_TTL_SECONDS = 15 * 60


/**
 * The library that belonged to everybody before sign-in existed.
 *
 * Kept so the episodes uploaded under the shared password are not orphaned.
 * Nothing creates it any more; it is adopted by whoever claims it, once.
 */
export const M0_OWNER = '00000000-0000-0000-0000-0000000000m0'.replace('m0', '0a')
const SERIES_TITLE = 'Overtone'

/**
 * Audio still affordable today, in hours.
 *
 * For telling someone how much room is left rather than only that they are
 * out of it. The daily cap is the one limit the provider does not report, so
 * it comes from our own tally (ADR 0021).
 */

/**
 * The chunks this episode was actually cut into.
 *
 * The planned boundaries come from arithmetic on the duration, and were
 * recomputed at six call sites that all agreed because they all did the same
 * sum. That holds only while the cuts land where the sum says — and the
 * browser now moves each seam into the nearest gap between words (US-040),
 * so the real boundaries have to be read rather than derived.
 *
 * A stored list stands in for the plan entirely. Falling back to the plan
 * for a *missing* list is right; falling back for one chunk of a list that
 * exists would mix planned and settled offsets in one episode, which is the
 * silent corruption both ADRs warn about — so it is all or nothing, and a
 * list of the wrong length is treated as absent rather than patched.
 */
export function chunksFor(episode: {
  readonly durationMs: number
  /*
   * Required, not optional. Optional would let a query that forgot to
   * select the column compile and silently fall back to the plan — the
   * whole feature doing nothing, with nothing to show for it. Spelling
   * `null` is a decision; omitting it was an accident waiting to look like
   * one.
   */
  readonly chunkStartsMs: readonly number[] | null
}): AudioChunk[] {
  const planned = planChunks(episode.durationMs)
  const settled = episode.chunkStartsMs

  if (settled === null || settled.length !== planned.length) return planned

  return planned.map((chunk, at) => ({
    ...chunk,
    startMs: settled[at] ?? chunk.startMs,
    endMs: settled[at + 1] ?? episode.durationMs,
  }))
}

export async function remainingDailyHours(): Promise<number> {
  const { dailyUsedMs } = await new DrizzleAllowanceStore(database()).read()

  return Math.max(0, Math.round(((DAILY_ALLOWANCE_MS - dailyUsedMs) / 3_600_000) * 10) / 10)
}

/**
 * Refuses to go on unless this episode is in this person's library.
 *
 * The second half of the access model. Anything addressed by an episode id
 * rather than derived from the signed-in user — reading a transcript,
 * deleting, advancing from a tab — arrives with an id the caller chose, and
 * a UUID in a URL is not a permission.
 *
 * Throws rather than returning a flag, so a caller cannot forget to look.
 */
export async function mustOwnEpisode(userId: string, episodeId: string): Promise<void> {
  const [found] = await database()
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(series, eq(series.id, episodes.seriesId))
    .where(and(eq(episodes.id, episodeId), eq(series.ownerId, userId)))
    .limit(1)

  if (found === undefined) throw new NotYours()
}

/** Thrown by `mustOwnEpisode`, turned into a 404 at the edge. */
export class NotYours extends Error {
  constructor() {
    super('not yours')
    this.name = 'NotYours'
  }
}

/**
 * This person's library, made the first time they upload anything.
 *
 * **Every query that reads or writes an episode hangs off the id this
 * returns.** That is the whole of the access model: there is no filter to
 * remember to add, because the series a caller can reach is derived from
 * who they are rather than passed in alongside. A route that forgets to
 * scope cannot — it has nothing to scope *to* until it asks for this.
 */
export async function seriesFor(userId: string): Promise<string> {
  const db = database()
  const [existing] = await db
    .select({ id: series.id })
    .from(series)
    .where(and(eq(series.ownerId, userId), eq(series.title, SERIES_TITLE)))
    .limit(1)

  if (existing) return existing.id

  const [created] = await db
    .insert(series)
    .values({ ownerId: userId, title: SERIES_TITLE })
    .returning({ id: series.id })

  const id = created?.id ?? ''
  await db.insert(seriesMembers).values({ seriesId: id, userId, role: 'owner' })
  return id
}

async function nextEpisodeNumber(seriesId: string): Promise<number> {
  const rows = await database()
    .select({ number: episodes.number })
    .from(episodes)
    .where(eq(episodes.seriesId, seriesId))

  return rows.reduce((highest, row) => Math.max(highest, row.number), 0) + 1
}

const chunkKey = (episodeId: string, index: number): string =>
  `episodes/${episodeId}/chunk-${index}.wav`

export interface StartedEpisode {
  readonly episodeId: string
  readonly chunks: ReadonlyArray<{
    readonly index: number
    readonly startMs: number
    readonly endMs: number
    readonly uploadUrl: string
  }>
  /**
   * This exact audio was already here, so nothing was uploaded.
   *
   * The episode returned is the one that already exists. Re-transcribing a
   * two-hour episode costs about a third of a day's allowance, and the
   * second copy would say exactly what the first one says.
   */
  readonly alreadyHave: boolean
  readonly title: string
}

/**
 * Creates the episode and tells the browser where to put each piece.
 *
 * The audio never passes through here. A serverless function accepts about
 * 4.5 MB of body and an episode is a hundred times that, so the bytes go
 * from the browser straight to storage and this hands out one short-lived
 * permission per chunk.
 */
export async function startEpisode(
  userId: string,
  durationMs: number,
  filename: string,
  language: AudioLanguage,
  audioDigest?: string,
): Promise<StartedEpisode> {
  const seriesId = await seriesFor(userId)
  const db = database()

  // The same audio under a different name is the same episode.
  if (audioDigest !== undefined && audioDigest.length > 0) {
    const [existing] = await db
      .select({ id: episodes.id, title: episodes.title })
      .from(episodes)
      .where(and(eq(episodes.seriesId, seriesId), eq(episodes.audioDigest, audioDigest)))
      .limit(1)

    if (existing !== undefined) {
      return { episodeId: existing.id, chunks: [], alreadyHave: true, title: existing.title }
    }
  }

  /*
   * A filename is not a title.
   *
   * `sun-your-balls-201.m4a` was being stored verbatim, so a library of
   * eleven episodes read like a directory listing. The number in the name
   * is the episode number when there is one, which is also what the library
   * sorts by.
   */
  const named = readEpisodeName(filename)

  /*
   * The publisher's own title beats a guess made from a filename.
   *
   * Looked up by episode number in the show's feed, when the series has
   * one. `Sun Your Balls #201` rather than `sun-your-balls-201`, and the
   * show notes along with it — though on this show those run to a line.
   *
   * A feed that cannot be reached must not stop an upload: the title read
   * from the filename is a perfectly good fallback, and refusing to accept
   * an episode because somebody else's XML is down would be absurd.
   */
  let published: PublishedEpisode | undefined
  if (named.number !== undefined) {
    const [series_] = await db
      .select({ feedUrl: series.feedUrl })
      .from(series)
      .where(eq(series.id, seriesId))
      .limit(1)

    try {
      published = await episodeDirectory(series_?.feedUrl)?.find(named.number)
    } catch (error) {
      console.warn('could not read the feed; keeping the name from the file', error)
    }
  }

  const title = published?.title ?? (named.title.length > 0 ? named.title : filename)
  const [created] = await db
    .insert(episodes)
    .values({
      seriesId,
      number: named.number ?? (await nextEpisodeNumber(seriesId)),
      title,
      // Stored now because every later step re-derives the chunk plan from
      // it, and the plan has to come out the same every time.
      durationMs,
      // Settled now, and never revisited. What an episode was transcribed
      // as is a fact about the episode, not about who is reading it later
      // (ADR 0022).
      language,
      ...(audioDigest === undefined ? {} : { audioDigest }),
      ...(published === undefined ? {} : { description: published.description }),
    })
    .returning({ id: episodes.id })

  const episodeId = created?.id ?? ''
  const blobs = blobStore()

  const chunks = await Promise.all(
    chunksFor({ durationMs, chunkStartsMs: null }).map(async (chunk) => ({
      ...chunk,
      uploadUrl: await blobs.uploadUrl(chunkKey(episodeId, chunk.index), AUDIO_URL_TTL_SECONDS),
    })),
  )

  return { episodeId, chunks, alreadyHave: false, title }
}

export interface LibraryEpisode {
  readonly episodeId: string
  readonly number: number
  readonly title: string
  readonly durationMs: number
  readonly status: string
  readonly chunksDone: number
  readonly chunkCount: number
  /**
   * Whether a link to this one is out there.
   *
   * Whether, not which. The token is the permission, and a list the page
   * asks for every few seconds is no place to carry one around.
   */
  readonly shared: boolean
}

/**
 * Every episode, newest first, with how far each one got.
 *
 * The page could only ever show one transcript — whichever episode was last
 * touched — so a series of eleven was ten transcripts you could not open.
 * Search already names the episode a moment came from; this is what makes
 * that name something you can click.
 */
export async function listEpisodes(userId: string): Promise<LibraryEpisode[]> {
  const db = database()

  const rows = await db
    .select({
      id: episodes.id,
      number: episodes.number,
      title: episodes.title,
      durationMs: episodes.durationMs,
      chunkStartsMs: episodes.chunkStartsMs,
      status: episodes.status,
      shareToken: episodes.shareToken,
      /*
       * Counted by joining, not by a correlated subquery.
       *
       * The subquery this replaces generated `where "episode_id" = "id"`
       * with both sides unqualified, so inside the subquery `"id"` bound to
       * the chunk's own id rather than the episode's. It compared a chunk's
       * episode to the chunk itself, matched nothing, and reported every
       * episode as having zero chunks — with no error, which is how it
       * survived a green typecheck and a passing build.
       */
      chunksDone: sql<number>`count(${chunkTranscripts.id})::int`,
    })
    .from(episodes)
    .leftJoin(chunkTranscripts, eq(chunkTranscripts.episodeId, episodes.id))
    .innerJoin(series, eq(series.id, episodes.seriesId))
    .where(eq(series.ownerId, userId))
    .groupBy(
      episodes.id,
      episodes.number,
      episodes.title,
      episodes.durationMs,
      episodes.status,
      episodes.shareToken,
    )
    .orderBy(desc(episodes.number))

  return rows.map((row) => ({
    episodeId: row.id,
    number: row.number,
    title: row.title,
    durationMs: row.durationMs,
    status: row.status,
    shared: row.shareToken !== null,
    chunksDone: row.chunksDone,
    chunkCount: chunksFor(row).length,
  }))
}

/**
 * Removes an episode and everything derived from it.
 *
 * The audio goes first. Deleting the row cascades to the transcripts,
 * counts and mentions, but storage knows nothing about foreign keys — a row
 * deleted without its blobs leaves audio nobody can reach and nothing will
 * ever clean up, on a tier that holds about a gigabyte.
 *
 * Most finished episodes have no audio left: it is removed as soon as an
 * episode is analysed. Removing what is already gone is the outcome this
 * wanted anyway, so it is not an error.
 */
export async function deleteEpisode(userId: string, episodeId: string): Promise<void> {
  await mustOwnEpisode(userId, episodeId)

  const db = database()

  const [episode] = await db
    .select({ durationMs: episodes.durationMs, chunkStartsMs: episodes.chunkStartsMs })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .limit(1)

  if (episode === undefined) return

  await blobStore().remove(
    chunksFor(episode).map((chunk) => chunkKey(episodeId, chunk.index)),
  )

  await db.delete(episodes).where(eq(episodes.id, episodeId))
}

export interface PendingEpisode {
  readonly episodeId: string
  readonly title: string
  readonly chunksDone: number
  readonly chunkCount: number
  /**
   * Whether this episode is still being transcribed.
   *
   * `false` means it is finished and only here to be read. The page must
   * not carry a finished episode forward — doing so would re-analyse it on
   * every page load.
   */
  readonly live: boolean
}

/**
 * The episode the page should be showing.
 *
 * Two jobs in one lookup, because the page wants the same thing either way:
 * something to read.
 *
 * An episode still being transcribed wins, and the page carries it forward
 * — the browser is what drives transcription, and a browser gets closed.
 * The oldest unfinished one wins so a newer upload cannot starve it.
 *
 * Failing that, the most recent episode that has any transcript at all.
 * Without this the transcript vanished the moment an episode finished and
 * the page was reloaded: there was a full transcript in the database and no
 * way whatsoever to look at it, which made the whole feature invisible
 * unless you happened to be watching during the upload.
 */
export async function pendingEpisode(userId: string): Promise<PendingEpisode | null> {
  const db = database()
  const chunks = new DrizzleChunkStore(db)

  const [transcribing] = await db
    .select({
      id: episodes.id,
      title: episodes.title,
      durationMs: episodes.durationMs,
      chunkStartsMs: episodes.chunkStartsMs,
    })
    .from(episodes)
    .innerJoin(series, eq(series.id, episodes.seriesId))
    .where(and(eq(episodes.status, 'transcribing'), eq(series.ownerId, userId)))
    .orderBy(asc(episodes.createdAt))
    .limit(1)

  if (transcribing !== undefined) {
    const done = await chunks.transcribedIndexes(transcribing.id)
    return {
      episodeId: transcribing.id,
      title: transcribing.title,
      chunksDone: done.length,
      chunkCount: chunksFor(transcribing).length,
      live: true,
    }
  }

  // Nothing in flight. Offer the latest thing there is to read.
  const [readable] = await db
    .select({
      id: episodes.id,
      title: episodes.title,
      durationMs: episodes.durationMs,
      chunkStartsMs: episodes.chunkStartsMs,
    })
    .from(episodes)
    .innerJoin(chunkTranscripts, eq(chunkTranscripts.episodeId, episodes.id))
    .innerJoin(series, eq(series.id, episodes.seriesId))
    .where(eq(series.ownerId, userId))
    .groupBy(episodes.id, episodes.title, episodes.durationMs, episodes.createdAt)
    .orderBy(desc(episodes.createdAt))
    .limit(1)

  if (readable === undefined) return null

  const done = await chunks.transcribedIndexes(readable.id)

  return {
    episodeId: readable.id,
    title: readable.title,
    chunksDone: done.length,
    chunkCount: chunksFor(readable).length,
    live: false,
  }
}

/**
 * Counts the running jokes again across everything already transcribed.
 *
 * Free, and that is the point. The chunk transcripts are kept, so defining a
 * joke today can count it in an episode from last month without sending a
 * second of audio anywhere — which matters when the budget is three
 * episodes a day (ADR 0005).
 *
 * It is `advanceOnce` under another name: an episode whose chunks are all in
 * re-stitches and re-analyses on the next step, so "recount" is simply
 * taking that step again.
 */
export async function recountFinished(userId: string): Promise<number> {
  const finished = await database()
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(series, eq(series.id, episodes.seriesId))
    .where(and(eq(episodes.status, 'ready'), eq(series.ownerId, userId)))

  let counted = 0
  for (const episode of finished) {
    // One at a time. They share a database connection pool of three, and a
    // recount is not urgent enough to starve an upload that is.
    await advanceOnce(episode.id)
    counted += 1
  }

  return counted
}

export interface AdvancedEpisode {
  readonly outcome: AdvanceEpisodeOutcome
  readonly analysis?: EpisodeAnalysis
  readonly chunkCount: number
  /**
   * Chunks finished so far.
   *
   * Reported on every step, including the ones that only wait. Without it a
   * page waiting on the allowance has nothing to show but a countdown that
   * restarts each time a chunk lands — which reads as a loop rather than as
   * progress, and was exactly how it read.
   */
  readonly chunksDone: number
}

/**
 * Carries the episode forward by one chunk, then returns.
 *
 * One step per request because the work genuinely spans more time than a
 * function gets: an episode is longer than a full hourly balance, so part of
 * it is always waiting for the allowance to refill (ADR 0020). The caller
 * comes back rather than the function sleeping.
 */
export async function advanceOnce(episodeId: string): Promise<AdvancedEpisode> {
  const db = database()
  const [episode] = await db
    .select({
      durationMs: episodes.durationMs,
      chunkStartsMs: episodes.chunkStartsMs,
      status: episodes.status,
      language: episodes.language,
      // The scheduled step has no signed-in user, so the running jokes come
      // from the episode's own library rather than from whoever is looking.
      seriesId: episodes.seriesId,
      // How long its audio has had to arrive.
      createdAt: episodes.createdAt,
    })
    .from(episodes)
    .where(eq(episodes.id, episodeId))

  if (episode === undefined) throw new Error(`no episode ${episodeId}`)

  const blobs = blobStore()
  const chunks = pipelineDependencies().chunks

  /*
   * A finished episode's plan is read off the chunks it actually has.
   *
   * Recomputing it would answer "how should this be split today", and the
   * answer changed when the target went from twenty minutes to twelve. For
   * an episode already transcribed that invents chunks nobody uploaded, and
   * re-deriving it — which is how a running joke defined today gets counted
   * in last month's episode — fails trying to find audio that was deleted
   * on purpose.
   */
  const plan =
    episode.status === 'ready'
      ? planFromTranscripts(await chunks.transcripts(episodeId), episode.durationMs)
      : chunksFor(episode)

  /*
   * Only the chunks still to be sent get a URL.
   *
   * Signed fresh rather than stored, because a read URL lasts minutes and
   * the work lasts hours. And signed *selectively*, because the audio is
   * deleted once an episode finishes: asking storage to sign a chunk that
   * is no longer there fails, which would make re-deriving a finished
   * episode impossible — and re-deriving is exactly how a running joke
   * defined today gets counted in last month's episode, for free.
   */
  const transcribed = new Set(await chunks.transcribedIndexes(episodeId))

  /*
   * Only chunks still to be sent get a URL, and a missing one is survivable.
   *
   * Signing is refused for a key that is not there — deliberately, so a
   * failure happens here where the key is in hand rather than at the
   * provider where a 404 says nothing. But an upload can stop halfway: close
   * the browser after chunk three of ten and chunks four onward were never
   * stored. Letting that throw made every later attempt fail with a 500, so
   * an interrupted upload could never be resumed and the episode was stuck
   * in `transcribing` for good.
   */
  const uploaded: UploadedChunk[] = await Promise.all(
    plan.map(async (chunk) => {
      if (transcribed.has(chunk.index)) return { ...chunk, audioUrl: '' }

      try {
        return {
          ...chunk,
          audioUrl: await blobs.readUrl(chunkKey(episodeId, chunk.index), AUDIO_URL_TTL_SECONDS),
        }
      } catch {
        // Nothing stored under that key. Reported below rather than thrown.
        return { ...chunk, audioUrl: '' }
      }
    }),
  )

  /*
   * The next chunk to send has no audio, so there is nothing to be done
   * except say so. `AUDIO_NOT_FOUND` reads as "the upload was interrupted —
   * nothing was lost, just try again", which is both true and actionable.
   */
  const next = plan.find((chunk) => !transcribed.has(chunk.index))
  const nextHasAudio =
    next === undefined ||
    (uploaded.find((chunk) => chunk.index === next.index)?.audioUrl ?? '') !== ''

  if (!nextHasAudio) {
    /*
     * Eventually written down, not just reported.
     *
     * The scheduled runner takes the **oldest** unfinished episode every
     * minute (ADR 0027), so an episode whose audio never arrived is
     * unfinishable *and* immovable: picked every minute, failing every
     * minute, starving everything behind it. Recording the failure takes it
     * out of the queue.
     *
     * Only after the grace period. The row is written before the chunks are
     * uploaded, so failing one the moment its audio is missing would kill a
     * perfectly good upload that is still arriving.
     */
    if (isAbandoned(episode.createdAt.getTime(), Date.now())) {
      await pipelineDependencies().store.setStatus(episodeId, 'failed', {
        code: 'AUDIO_NOT_FOUND',
      })
    }

    return {
      outcome: { state: 'failed', failure: { code: 'AUDIO_NOT_FOUND' } },
      chunkCount: plan.length,
      chunksDone: transcribed.size,
    }
  }

  const outcome = await advanceEpisode(
    {
      episodeId,
      chunks: uploaded,
      topics: await topicsOfSeries(episode.seriesId),
      // The episode's own language, not the reader's.
      language: asAudioLanguage(episode.language),
    },
    pipelineDependencies(),
  )

  const chunksDone = (await pipelineDependencies().chunks.transcribedIndexes(episodeId)).length

  if (outcome.state !== 'ready') return { outcome, chunkCount: plan.length, chunksDone }

  // The audio has done its job: the provider's payload is what re-derivation
  // reads, and 1 GB of storage is the ceiling that arrives first. Harmless
  // to repeat — removing what is already gone is the outcome it wanted.
  await blobs.remove(plan.map((chunk) => chunkKey(episodeId, chunk.index)))

  return {
    outcome,
    analysis: await readAnalysisOf(episodeId, episode.durationMs),
    chunkCount: plan.length,
    chunksDone,
  }
}

/** Reads back what the pipeline stored, which is what the page renders. */
export async function readAnalysisOf(
  episodeId: string,
  durationMs: number,
): Promise<EpisodeAnalysis> {
  const db = database()

  const [insight] = await db.select().from(insights).where(eq(insights.episodeId, episodeId))
  const [transcript] = await db
    .select({ vocabularyVersion: transcripts.vocabularyVersion })
    .from(transcripts)
    .where(eq(transcripts.episodeId, episodeId))
  const counts = await db.select().from(termCounts).where(eq(termCounts.episodeId, episodeId))
  const found = await db.select().from(mentions).where(eq(mentions.episodeId, episodeId))
  // This episode's own library. Reading every topic there is would be
  // wasteful at best and, once there is more than one group, theirs.
  const named = await db
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .innerJoin(episodes, eq(episodes.seriesId, topics.seriesId))
    .where(eq(episodes.id, episodeId))

  const byTopic = new Map(named.map((topic) => [topic.id, topic.name]))

  return {
    durationMs,
    totalTokens: insight?.totalTokens ?? 0,
    wordTokens: insight?.wordTokens ?? 0,
    stopWordTokens: insight?.stopWordTokens ?? 0,
    fillerTokens: insight?.fillerTokens ?? 0,
    uniqueTerms: insight?.uniqueTerms ?? 0,
    wordsPerMinute: insight?.wordsPerMinute ?? 0,
    fillersPerMinute: insight?.fillersPerMinute ?? 0,
    topTerms: counts
      .sort((a, b) => b.count - a.count || (a.lemma < b.lemma ? -1 : 1))
      .slice(0, 50)
      .map((row) => ({
        term: row.lemma,
        count: row.count,
        surfaceForms: row.surfaceForms,
        heuristic: row.heuristic,
      })),
    topics: [...new Set(found.map((mention) => mention.topicId))].map((topicId) => {
      const hits = found.filter((mention) => mention.topicId === topicId)
      return {
        topicId,
        topicName: byTopic.get(topicId) ?? '',
        count: hits.length,
        mentions: hits.map((hit) => ({
          matchedText: hit.matchedText,
          startMs: hit.startMs,
          endMs: hit.endMs,
        })),
      }
    }),
    pipelineVersion: insight?.pipelineVersion ?? 0,
    vocabularyVersion: transcript?.vocabularyVersion ?? VOCABULARY_VERSION,
  }
}

