/**
 * End-to-end against everything real: a real Groq transcript, the real
 * 825,000-pair dictionary in Postgres, the real analysis, written to and read
 * back from the live database.
 *
 *   pnpm --filter @overtone/db db:smoke -- <transcript.json>
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { processEpisode, type Topic } from '@overtone/core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { lemmaQuery } from './lemmas/lemma-query.js'
import { DrizzleEpisodeStore } from './repositories/drizzle-episode-store.js'
import { episodes, insights, mentions, series, seriesMembers, termCounts, topics, topicTerms, transcripts } from './schema.js'
import { eq } from 'drizzle-orm'

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

/** Replays the real Groq response through the port, no network involved. */
const replay = {
  transcribe: () =>
    Promise.resolve({
      ok: true as const,
      transcript: {
        provider: 'groq',
        providerModel: 'whisper-large-v3-turbo',
        text: groq.text,
        words: groq.words.map((w) => ({
          text: w.word,
          startMs: Math.round(w.start * 1000),
          endMs: Math.round(w.end * 1000),
        })),
        language: 'pt',
        durationMs: Math.round(groq.duration * 1000),
        raw: groq,
      },
    }),
}

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

  const outcome = await processEpisode(
    { episodeId, audioUrl: 'replayed', topics: made },
    {
      transcription: replay,
      lemmas: { lookup: async (forms) => new Map((await lemmaQuery(db)(forms)).map((r) => [r.form, r.lemma])) },
      store: new DrizzleEpisodeStore(db),
    },
  )

  console.log(`\n  pipeline: ${outcome.ok ? 'ok' : `failed — ${JSON.stringify(outcome.failure)}`}`)

  // Read everything back out of Postgres.
  const [ep] = await db.select({ status: episodes.status }).from(episodes).where(eq(episodes.id, episodeId))
  const [ins] = await db.select().from(insights).where(eq(insights.episodeId, episodeId))
  const counts = await db.select().from(termCounts).where(eq(termCounts.episodeId, episodeId))
  const found = await db.select().from(mentions).where(eq(mentions.episodeId, episodeId))
  const [tr] = await db.select({ provider: transcripts.provider }).from(transcripts).where(eq(transcripts.episodeId, episodeId))

  const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

  console.log(`  status:   ${ep?.status}`)
  console.log(`  provider: ${tr?.provider}`)
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
