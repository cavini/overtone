import {
  advanceEpisode,
  DAILY_ALLOWANCE_MS,
  planChunks,
  asAudioLanguage,
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
import { and, asc, desc, eq } from 'drizzle-orm'
import { DrizzleAllowanceStore, DrizzleChunkStore } from '@overtone/db/repositories'
import { listTopics } from './topics.js'
import { blobStore, database, pipelineDependencies } from './wiring.js'

/**
 * How long a signed URL has to stay good.
 *
 * Long enough for the provider to fetch a chunk and transcribe it, short
 * enough that a leaked URL is worthless by the time anyone finds it.
 */
const AUDIO_URL_TTL_SECONDS = 15 * 60


/**
 * The series everything lands in until there is sign-in.
 *
 * M0 is deliberately crude here — one shared library, no accounts (see the
 * roadmap). It is a fixed id rather than a lookup by title so that restarting
 * the app does not quietly start a second library.
 */
const M0_OWNER = '00000000-0000-0000-0000-0000000000m0'.replace('m0', '0a')
const M0_SERIES_TITLE = 'Overtone'

/**
 * Audio still affordable today, in hours.
 *
 * For telling someone how much room is left rather than only that they are
 * out of it. The daily cap is the one limit the provider does not report, so
 * it comes from our own tally (ADR 0021).
 */
export async function remainingDailyHours(): Promise<number> {
  const { dailyUsedMs } = await new DrizzleAllowanceStore(database()).read()

  return Math.max(0, Math.round(((DAILY_ALLOWANCE_MS - dailyUsedMs) / 3_600_000) * 10) / 10)
}

/** The shared library, created the first time anything is uploaded. */
export async function sharedSeriesId(): Promise<string> {
  const db = database()
  const [existing] = await db
    .select({ id: series.id })
    .from(series)
    .where(and(eq(series.ownerId, M0_OWNER), eq(series.title, M0_SERIES_TITLE)))
    .limit(1)

  if (existing) return existing.id

  const [created] = await db
    .insert(series)
    .values({ ownerId: M0_OWNER, title: M0_SERIES_TITLE })
    .returning({ id: series.id })

  const id = created?.id ?? ''
  await db.insert(seriesMembers).values({ seriesId: id, userId: M0_OWNER, role: 'owner' })
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
  durationMs: number,
  title: string,
  language: AudioLanguage,
): Promise<StartedEpisode> {
  const seriesId = await sharedSeriesId()
  const [created] = await database()
    .insert(episodes)
    .values({
      seriesId,
      number: await nextEpisodeNumber(seriesId),
      title,
      // Stored now because every later step re-derives the chunk plan from
      // it, and the plan has to come out the same every time.
      durationMs,
      // Settled now, and never revisited. What an episode was transcribed
      // as is a fact about the episode, not about who is reading it later
      // (ADR 0022).
      language,
    })
    .returning({ id: episodes.id })

  const episodeId = created?.id ?? ''
  const blobs = blobStore()

  const chunks = await Promise.all(
    planChunks(durationMs).map(async (chunk) => ({
      ...chunk,
      uploadUrl: await blobs.uploadUrl(chunkKey(episodeId, chunk.index), AUDIO_URL_TTL_SECONDS),
    })),
  )

  return { episodeId, chunks }
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
export async function pendingEpisode(): Promise<PendingEpisode | null> {
  const db = database()
  const chunks = new DrizzleChunkStore(db)

  const [transcribing] = await db
    .select({ id: episodes.id, title: episodes.title, durationMs: episodes.durationMs })
    .from(episodes)
    .where(eq(episodes.status, 'transcribing'))
    .orderBy(asc(episodes.createdAt))
    .limit(1)

  if (transcribing !== undefined) {
    const done = await chunks.transcribedIndexes(transcribing.id)
    return {
      episodeId: transcribing.id,
      title: transcribing.title,
      chunksDone: done.length,
      chunkCount: planChunks(transcribing.durationMs).length,
      live: true,
    }
  }

  // Nothing in flight. Offer the latest thing there is to read.
  const [readable] = await db
    .select({ id: episodes.id, title: episodes.title, durationMs: episodes.durationMs })
    .from(episodes)
    .innerJoin(chunkTranscripts, eq(chunkTranscripts.episodeId, episodes.id))
    .groupBy(episodes.id, episodes.title, episodes.durationMs, episodes.createdAt)
    .orderBy(desc(episodes.createdAt))
    .limit(1)

  if (readable === undefined) return null

  const done = await chunks.transcribedIndexes(readable.id)

  return {
    episodeId: readable.id,
    title: readable.title,
    chunksDone: done.length,
    chunkCount: planChunks(readable.durationMs).length,
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
export async function recountFinished(): Promise<number> {
  const finished = await database()
    .select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.status, 'ready'))

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
      status: episodes.status,
      language: episodes.language,
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
      : planChunks(episode.durationMs)

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
      topics: await listTopics(),
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
    analysis: await readAnalysis(episodeId, episode.durationMs),
    chunkCount: plan.length,
    chunksDone,
  }
}

/** Reads back what the pipeline stored, which is what the page renders. */
async function readAnalysis(episodeId: string, durationMs: number): Promise<EpisodeAnalysis> {
  const db = database()

  const [insight] = await db.select().from(insights).where(eq(insights.episodeId, episodeId))
  const [transcript] = await db
    .select({ vocabularyVersion: transcripts.vocabularyVersion })
    .from(transcripts)
    .where(eq(transcripts.episodeId, episodeId))
  const counts = await db.select().from(termCounts).where(eq(termCounts.episodeId, episodeId))
  const found = await db.select().from(mentions).where(eq(mentions.episodeId, episodeId))
  const named = await db.select({ id: topics.id, name: topics.name }).from(topics)

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

