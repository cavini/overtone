/** Which Portuguese-exclusive function words landed in an English transcript. */
import { languagePack, normalize } from '../../../packages/core/src/index.js'
import { database } from '../src/server/wiring.js'
import { chunkTranscripts, episodes } from '../../../packages/db/src/schema.js'
import { asc, eq, ilike } from 'drizzle-orm'

const db = database()
const [ep] = await db
  .select({ id: episodes.id, title: episodes.title, language: episodes.language })
  .from(episodes)
  .where(ilike(episodes.title, `%${process.argv[2] ?? ''}%`))
  .orderBy(asc(episodes.number))

if (ep === undefined) { console.log('not found'); process.exit(0) }

const pt = languagePack('pt').stopWords
const en = languagePack('en').stopWords
const ptOnly = new Set([...pt].filter((w) => !en.has(w)))

const rows = await db
  .select({ index: chunkTranscripts.index, words: chunkTranscripts.words })
  .from(chunkTranscripts)
  .where(eq(chunkTranscripts.episodeId, ep.id))
  .orderBy(asc(chunkTranscripts.index))

const tally = new Map<string, number>()
let total = 0
for (const row of rows) {
  const words = (row.words ?? []) as ReadonlyArray<{ text?: string }>
  const text = normalize(words.map((w) => w.text ?? '').join(' '))
  for (const w of text.length === 0 ? [] : text.split(' ')) {
    total += 1
    if (ptOnly.has(w)) tally.set(w, (tally.get(w) ?? 0) + 1)
  }
}

console.log(`${ep.title}  (language=${ep.language}, ${total} words)\n`)
console.log('palavras-funcao exclusivamente portuguesas encontradas:')
for (const [word, count] of [...tally].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${word.padEnd(12)} ${count}`)
}
const sum = [...tally.values()].reduce((a, b) => a + b, 0)
console.log(`\n  ${tally.size} palavras distintas, ${sum} ocorrencias (${((sum / total) * 100).toFixed(1)}% do texto)`)
process.exit(0)
