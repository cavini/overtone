/** Did the leaked words reach the counts, and what does the payload say about confidence. */
import { languagePack } from '../../../packages/core/src/index.js'
import { database } from '../src/server/wiring.js'
import { episodes, termCounts, transcripts } from '../../../packages/db/src/schema.js'
import { asc, desc, eq, ilike } from 'drizzle-orm'

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

const top = await db
  .select({ term: termCounts.lemma, count: termCounts.count })
  .from(termCounts)
  .where(eq(termCounts.episodeId, ep.id))
  .orderBy(desc(termCounts.count))
  .limit(25)

console.log(`${ep.title} (language=${ep.language})\n`)
console.log('top 25 termos como o app mostra:')
for (const [at, t] of top.entries()) {
  const flag = ptOnly.has(t.term) ? '  <-- PORTUGUES' : ''
  console.log(`  ${String(at + 1).padStart(2)}. ${t.term.padEnd(16)} ${String(t.count).padStart(4)}${flag}`)
}

const all = await db
  .select({ term: termCounts.lemma, count: termCounts.count })
  .from(termCounts)
  .where(eq(termCounts.episodeId, ep.id))
const leaked = all.filter((t) => ptOnly.has(t.term))
console.log(`\n${all.length} termos contados; ${leaked.length} deles sao palavra-funcao portuguesa:`)
for (const t of leaked.sort((a, b) => b.count - a.count)) console.log(`  ${t.term.padEnd(16)} ${t.count}`)

const [raw] = await db
  .select({ payload: transcripts.rawProviderPayload, quality: transcripts.qualityScore })
  .from(transcripts)
  .where(eq(transcripts.episodeId, ep.id))
  .limit(1)

console.log(`\nqualityScore armazenado: ${String(raw?.quality ?? '(nulo)')}`)
const payload = raw?.payload as { language?: string; segments?: Array<Record<string, unknown>> } | undefined
if (payload !== undefined) {
  console.log(`\npayload: provider disse language=${payload.language ?? '(ausente)'}`)
  const segs = payload.segments ?? []
  const keys = segs[0] === undefined ? [] : Object.keys(segs[0])
  console.log(`  ${segs.length} segmentos, campos: ${keys.join(', ') || '(nenhum)'}`)
  const lp = segs.map((s) => Number(s['avg_logprob'])).filter((n) => Number.isFinite(n))
  if (lp.length > 0) {
    lp.sort((a, b) => a - b)
    const mean = lp.reduce((a, b) => a + b, 0) / lp.length
    console.log(`  avg_logprob: media ${mean.toFixed(3)}, pior ${lp[0]?.toFixed(3)}, melhor ${lp.at(-1)?.toFixed(3)}`)
    console.log(`  segmentos abaixo de -1.0 (sinal de alucinacao): ${lp.filter((n) => n < -1).length}`)
  }
}
process.exit(0)
