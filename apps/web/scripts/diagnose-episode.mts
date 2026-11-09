/**
 * What language an episode was actually transcribed as, and what its words say.
 *
 * Read-only. Prints verdicts and counts, never transcript text.
 *
 *   pnpm --filter @overtone/web exec tsx apps/web/scripts/diagnose-episode.mts "Loose Threads"
 */
import { languageFromStopWords } from '../../../packages/core/src/index.js'
import { database } from '../src/server/wiring.js'
import { chunkTranscripts, episodes } from '../../../packages/db/src/schema.js'
import { asc, eq, ilike } from 'drizzle-orm'

const wanted = process.argv[2] ?? ''
if (wanted.length === 0) {
  console.error('usage: tsx apps/web/scripts/diagnose-episode.mts "<title fragment>"')
  process.exit(1)
}

const db = database()

const found = await db
  .select({
    id: episodes.id,
    number: episodes.number,
    title: episodes.title,
    language: episodes.language,
    status: episodes.status,
    durationMs: episodes.durationMs,
    chunkStartsMs: episodes.chunkStartsMs,
    category: episodes.category,
  })
  .from(episodes)
  .where(ilike(episodes.title, `%${wanted}%`))
  .orderBy(asc(episodes.number))

if (found.length === 0) {
  console.log(`no episode whose title contains ${JSON.stringify(wanted)}`)
  process.exit(0)
}

for (const episode of found) {
  console.log(
    `\n#${episode.number} ${episode.title}` +
      `\n  episodes.language = ${episode.language}` +
      `\n  status            = ${episode.status}` +
      `\n  duration          = ${(episode.durationMs / 60_000).toFixed(1)} min` +
      `\n  programme         = ${episode.category ?? '(none)'}` +
      `\n  chunk_starts_ms   = ${
        episode.chunkStartsMs === null ? 'null (fell back to planChunks)' : `${episode.chunkStartsMs.length} settled`
      }`,
  )

  const chunks = await db
    .select({ index: chunkTranscripts.index, words: chunkTranscripts.words })
    .from(chunkTranscripts)
    .where(eq(chunkTranscripts.episodeId, episode.id))
    .orderBy(asc(chunkTranscripts.index))

  console.log(`  ${chunks.length} chunk transcripts`)

  for (const chunk of chunks) {
    const words = (chunk.words ?? []) as ReadonlyArray<{ text?: string }>
    const text = words.map((w) => w.text ?? '').join(' ')
    const verdict = languageFromStopWords(text)

    console.log(
      `    chunk ${String(chunk.index).padStart(2)}  ${String(words.length).padStart(5)} words` +
        `  words say ${verdict.language ?? 'nothing'}` +
        `  (pt ${verdict.pt} / en ${verdict.en})`,
    )
  }
}

process.exit(0)
