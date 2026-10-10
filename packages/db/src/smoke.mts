/**
 * End-to-end against everything real: a real Groq transcript, the real
 * 825,000-pair dictionary in Postgres, the real analysis, written to and read
 * back from the live database.
 *
 * The transcript is replayed chunk by chunk through the paced loop, because
 * that is how an episode is actually transcribed (ADR 0020) — one chunk per
 * step, waiting on the hourly allowance in between. The clock is the only
 * thing faked: it jumps forward instead of sleeping, so a run that takes an
 * hour in production takes a second here.
 *
 *   pnpm --filter @overtone/db db:smoke -- <transcript.json>
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  advanceEpisode,
  planChunks,
  stitchChunks,
  type Topic,
  type UploadedChunk,
  type AudioLanguage,
} from '@overtone/core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { lemmaQuery } from './lemmas/lemma-query.js'
import { DrizzleAllowanceStore } from './repositories/drizzle-allowance-store.js'
import { DrizzleChunkStore } from './repositories/drizzle-chunk-store.js'
import { DrizzleEpisodeStore } from './repositories/drizzle-episode-store.js'
import { allowance, chunkTranscripts, episodes, insights, mentions, series, seriesMembers, termCounts, topics, topicTerms, transcripts, verbForms } from './schema.js'
import { and, eq, inArray } from 'drizzle-orm'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const transcriptFile = process.argv.at(-1) ?? ''
const groq = JSON.parse(readFileSync(transcriptFile, 'utf8')) as {
  text: string
  duration: number
  words: Array<{ word: string; start: number; end: number }>
}

const USER = '00000000-0000-0000-0000-000000000001'
const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 1, onnotice: () => {} })
const db = drizzle(sql)

const durationMs = Math.round(groq.duration * 1000)
const words = groq.words.map((w) => ({
  text: w.word,
  startMs: Math.round(w.start * 1000),
  endMs: Math.round(w.end * 1000),
}))

// What the browser would have uploaded.
const plan = planChunks(durationMs)
const uploaded: UploadedChunk[] = plan.map((chunk) => ({
  ...chunk,
  audioUrl: `replayed://chunk/${chunk.index}`,
}))

/**
 * Replays the real Groq response one chunk at a time, no network involved.
 *
 * Word timings come back **relative to the chunk**, which is what the real
 * provider returns for a chunk file and what makes stitching load-bearing.
 */
const replay = {
  transcribe: ({ audioUrl }: { audioUrl: string }) => {
    const index = Number(audioUrl.split('/').at(-1))
    const chunk = plan[index]
    if (chunk === undefined) throw new Error(`no chunk ${index}`)

    const mine = words.filter((w) => w.startMs >= chunk.startMs && w.startMs < chunk.endMs)
    return Promise.resolve({
      ok: true as const,
      transcript: {
        provider: 'groq',
        providerModel: 'whisper-large-v3',
        text: mine.map((w) => w.text).join(' '),
        words: mine.map((w) => ({
          text: w.text,
          startMs: w.startMs - chunk.startMs,
          endMs: w.endMs - chunk.startMs,
        })),
        // The fixture is a word list with no segment boundaries in it, so
        // this replays the case where the transcriber reported none.
        segmentStartsMs: [],
        language: 'pt',
        durationMs: chunk.endMs - chunk.startMs,
        raw: { replayedChunk: index },
      },
    })
  },
}

// Jumps instead of sleeping. The one thing not real about this run.
let nowMs = Date.parse('2026-10-09T09:00:00.000Z')
const clock = { now: () => nowMs }

try {
  // A clean series each run.
  await sql.unsafe(`delete from public.series where owner_id = '${USER}'`)

  const [createdSeries] = await db
    .insert(series).values({ ownerId: USER, title: 'Overtone Cast' })
    .returning({ id: series.id })
  const seriesId = createdSeries?.id ?? ''
  await db.insert(seriesMembers).values({ seriesId, userId: USER, role: 'owner' })

  const [createdEpisode] = await db
    .insert(episodes).values({ seriesId, number: 12, title: 'Episódio 12' })
    .returning({ id: episodes.id })
  const episodeId = createdEpisode?.id ?? ''

  // Two running jokes. The second carries the mishearing as an alias.
  const made: Topic[] = []
  for (const [name, patterns] of [
    ['Pirão', ['pirão']],
    ['Hotdog', ['hotdog', 'hot dog']],
    ['Hotdog (com alias)', ['hotdog', 'hot dog', 'outdog']],
  ] as const) {
    const [t] = await db.insert(topics).values({ seriesId, name }).returning({ id: topics.id })
    const id = t?.id ?? ''
    await db.insert(topicTerms).values(
      patterns.map((p) => ({ topicId: id, pattern: p, matchKey: p.replaceAll(/[\s-]/gu, '') })),
    )
    made.push({ id, name, patterns: [...patterns] })
  }

  // A clean allowance, so the pacing below is the episode's own.
  await db.delete(allowance)

  const deps = {
    transcription: replay,
    lemmas: {
      lookup: async (forms: readonly string[], language: AudioLanguage) =>
        new Map((await lemmaQuery(db)(forms, language)).map((r) => [r.form, r.lemma])),
      verbForms: async (forms: readonly string[], language: AudioLanguage) =>
        new Set(
          (
            await db
              .select({ form: verbForms.form })
              .from(verbForms)
              .where(and(eq(verbForms.language, language), inArray(verbForms.form, [...forms])))
          ).map((row) => row.form),
        ),
    },
    chunks: new DrizzleChunkStore(db),
    allowance: new DrizzleAllowanceStore(db),
    store: new DrizzleEpisodeStore(db),
    clock,
  }

  const startedAt = nowMs
  const mmssOf = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

  console.log(`\n  ${plan.length} chunks over ${mmssOf(durationMs)} of audio\n`)

  let steps = 0
  let waits = 0
  for (;;) {
    if (++steps > plan.length * 4) throw new Error('paced loop did not finish')

    const outcome = await advanceEpisode({ episodeId, chunks: uploaded, topics: made }, deps)

    if (outcome.state === 'failed') {
      console.log(`  failed — ${JSON.stringify(outcome.failure)}`)
      break
    }
    if (outcome.state === 'ready') {
      console.log('  stitched and analysed')
      break
    }
    if (outcome.state === 'waiting') {
      waits += 1
      console.log(`    wait   ${Math.round(outcome.retryAfterMs / 60000)} min — ${outcome.reason}`)
      // What a real deployment would sleep through.
      nowMs += outcome.retryAfterMs
      continue
    }
    console.log(`    chunk ${outcome.chunkIndex}  sent, ${outcome.remaining} to go`)
  }

  console.log(`\n  ${steps} steps, ${waits} wait${waits === 1 ? '' : 's'}, ${mmssOf(nowMs - startedAt)} of wall clock`)

  // The highest-risk arithmetic in the repo: offsetting on stitch. It fails
  // silently — counts stay plausible and point at the wrong moment — so the
  // reassembled words are compared against the ones we started with.
  const reassembled = stitchChunks(await deps.chunks.transcripts(episodeId))
  const drift = reassembled.findIndex(
    (w, i) => w.text !== words[i]?.text || w.startMs !== words[i]?.startMs,
  )
  console.log(
    drift === -1
      ? `  round trip: ${reassembled.length}/${words.length} words, timings exact`
      : `  ROUND TRIP BROKEN at word ${drift}: ${JSON.stringify(reassembled[drift])} vs ${JSON.stringify(words[drift])}`,
  )

  // Read everything back out of Postgres.
  const [ep] = await db.select({ status: episodes.status }).from(episodes).where(eq(episodes.id, episodeId))
  const [ins] = await db.select().from(insights).where(eq(insights.episodeId, episodeId))
  const counts = await db.select().from(termCounts).where(eq(termCounts.episodeId, episodeId))
  const found = await db.select().from(mentions).where(eq(mentions.episodeId, episodeId))
  const [tr] = await db.select({ provider: transcripts.provider }).from(transcripts).where(eq(transcripts.episodeId, episodeId))

  const chunkRows = await db.select().from(chunkTranscripts).where(eq(chunkTranscripts.episodeId, episodeId))
  const mmss = mmssOf

  console.log(`  status:   ${ep?.status}`)
  console.log(`  provider: ${tr?.provider}`)
  console.log(`  chunks:   ${chunkRows.length} stored`)
  console.log(`  words:    ${ins?.totalTokens} total, ${ins?.wordTokens} countable, ${ins?.wordsPerMinute} wpm\n`)

  console.log('  RUNNING JOKES (read back from postgres)')
  for (const topic of made) {
    const hits = found.filter((m) => m.topicId === topic.id)
    const where = hits.map((m) => `${mmss(m.startMs)} "${m.matchedText}"`).join('  ')
    console.log(`    ${topic.name.padEnd(20)} ${String(hits.length).padStart(2)}   ${where}`)
  }

  console.log('\n  MOST SAID')
  for (const c of counts.sort((a, b) => b.count - a.count || (a.lemma < b.lemma ? -1 : 1)).slice(0, 10)) {
    const forms = c.surfaceForms.length > 1 ? `   (${c.surfaceForms.join(' / ')})` : ''
    console.log(`    ${c.lemma.padEnd(14)} ${String(c.count).padStart(2)}${forms}${c.heuristic ? '  ~guessed' : ''}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
} finally {
  await sql.end()
}
