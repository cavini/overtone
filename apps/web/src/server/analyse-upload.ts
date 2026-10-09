import {
  advanceEpisode,
  CHUNK_TARGET_MS,
  planChunks,
  type AdvanceEpisodeOutcome,
  type EpisodeAnalysis,
  type UploadedChunk,
  VOCABULARY_VERSION,
} from '@overtone/core'
import {
  episodes,
  insights,
  mentions,
  series,
  seriesMembers,
  termCounts,
  topics,
  transcripts,
} from '@overtone/db/schema'
import { and, eq } from 'drizzle-orm'
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

export interface AnalysedUpload {
  readonly episodeId: string
  readonly outcome: AdvanceEpisodeOutcome
  readonly analysis?: EpisodeAnalysis
  readonly chunkCount: number
}

/** The shared library, created the first time anything is uploaded. */
async function sharedSeriesId(): Promise<string> {
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

/**
 * Takes an uploaded file as far as the allowance lets it.
 *
 * The audio is stored first and transcribed second, because a paced chunk is
 * fetched by the provider later — possibly minutes later, from another
 * process (ADR 0020). It has to be somewhere durable before anything asks for
 * it, and the signed URL is minted per attempt rather than stored.
 *
 * The loop runs until the pipeline says to wait. Waiting is where this
 * returns, not where it sleeps: a serverless function has 300 seconds and the
 * allowance can ask for minutes, so the caller comes back instead.
 */
export async function analyseUpload(
  audio: Uint8Array,
  contentType: string,
  durationMs: number,
  title: string,
): Promise<AnalysedUpload> {
  const seriesId = await sharedSeriesId()
  const [created] = await database()
    .insert(episodes)
    .values({
      seriesId,
      number: await nextEpisodeNumber(seriesId),
      title,
      // What the browser measured and what it sent. Both are needed before
      // transcription: the duration decides the chunk plan, and the size is
      // what the storage ceiling is spent on.
      durationMs,
      byteSize: audio.byteLength,
    })
    .returning({ id: episodes.id })

  const episodeId = created?.id ?? ''
  const blobs = blobStore()

  // One chunk per planned boundary. In M0 the browser uploads a single file
  // and anything under the chunk target is one piece; the plan is still what
  // decides, so nothing here changes when the browser starts splitting.
  const plan = planChunks(durationMs)
  const extension = contentType.includes('mpeg') ? 'mp3' : 'opus'
  const uploaded: UploadedChunk[] = []

  for (const piece of plan) {
    const key = `episodes/${episodeId}/chunk-${piece.index}.${extension}`
    // The whole file for a single-chunk episode. Slicing audio by byte range
    // would corrupt it — splitting is the encoder's job, in the browser.
    await blobs.put(key, audio, contentType)
    uploaded.push({ ...piece, audioUrl: await blobs.readUrl(key, AUDIO_URL_TTL_SECONDS) })
  }

  const deps = pipelineDependencies()
  let outcome: AdvanceEpisodeOutcome = { state: 'ready' }

  // Bounded: one step per chunk, plus room for the step that finds them all
  // done. A runaway loop here would burn the day's allowance.
  for (let step = 0; step <= plan.length; step += 1) {
    outcome = await advanceEpisode({ episodeId, chunks: uploaded, topics: [] }, deps)

    if (outcome.state === 'ready' || outcome.state === 'failed') break
    // Not slept through — the caller is told to come back.
    if (outcome.state === 'waiting') break
  }

  if (outcome.state !== 'ready') {
    return { episodeId, outcome, chunkCount: plan.length }
  }

  // The audio has done its job: the provider's payload is what re-derivation
  // reads, and 1 GB of storage is the ceiling that arrives first.
  await blobs.remove(uploaded.map((chunk) => keyOf(episodeId, chunk, extension)))

  return {
    episodeId,
    outcome,
    analysis: await readAnalysis(episodeId, durationMs),
    chunkCount: plan.length,
  }
}

const keyOf = (episodeId: string, chunk: UploadedChunk, extension: string): string =>
  `episodes/${episodeId}/chunk-${chunk.index}.${extension}`

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

export { CHUNK_TARGET_MS }
