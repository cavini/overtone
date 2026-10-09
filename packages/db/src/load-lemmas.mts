/**
 * Loads the Portuguese dictionary into the `lemmas` table.
 *
 * Run `pnpm fetch:lemmas` first; it downloads the published list and writes
 * the parsed pairs to `packages/db/data/lemmas-pt.tsv`, which is gitignored
 * because 17 MB of text does not belong in git history.
 *
 *   pnpm --filter @overtone/db db:load-lemmas
 *
 * Uses `COPY` rather than inserts: 825,000 rows is a few seconds streamed and
 * several minutes in batches.
 *
 * Attribution and licence terms are in ATTRIBUTION.md. The data is ODbL.
 */
import { createReadStream, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const dataFile = resolve(here, '../data/lemmas-pt.tsv')
if (!existsSync(dataFile)) {
  console.error(`${dataFile} is missing. Run: pnpm fetch:lemmas`)
  process.exit(1)
}

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 1, onnotice: () => {} })

try {
  const started = Date.now()

  // The file is form<TAB>lemma, which is the column order below.
  await sql.unsafe('truncate table public.lemmas')

  const writable = await sql`
    copy public.lemmas (form, lemma) from stdin with (format text, delimiter E'\t')
  `.writable()

  await pipeline(createReadStream(dataFile), writable)

  const rows = await sql<Array<{ count: number }>>`select count(*)::int from public.lemmas`
  const seconds = ((Date.now() - started) / 1000).toFixed(1)

  console.log(`loaded ${(rows[0]?.count ?? 0).toLocaleString()} pairs in ${seconds}s`)

  const samples = await sql<Array<{ form: string; lemma: string }>>`
    select form, lemma from public.lemmas
     where form = any(${['falei', 'falando', 'fui', 'disse', 'gravações', 'casas', 'país']})
     order by form
  `
  for (const { form, lemma } of samples) console.log(`  ${form.padEnd(11)} -> ${lemma}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await sql.end()
}
