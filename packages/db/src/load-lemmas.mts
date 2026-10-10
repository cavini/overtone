/**
 * Loads a dictionary into the `lemmas` table, one language at a time.
 *
 * Run `pnpm fetch:lemmas` first; it downloads the published lists and writes
 * `packages/db/data/lemmas-<language>.tsv`, which is gitignored because 17 MB
 * of text does not belong in git history.
 *
 *   pnpm --filter @overtone/db db:load-lemmas        # every list present
 *   pnpm --filter @overtone/db db:load-lemmas en     # just one
 *
 * Uses `COPY` rather than inserts: 825,000 rows is a few seconds streamed and
 * several minutes in batches.
 *
 * Deletes only the language it is about to load. It used to truncate, which
 * was right while there was one dictionary and is wrong now — loading English
 * would have silently taken Portuguese with it, and the next episode analysed
 * would have reported a frequency list made of stems with no sign anything
 * was missing.
 *
 * Attribution and licence terms are in ATTRIBUTION.md. The data is ODbL.
 */
import { createReadStream, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { AUDIO_LANGUAGES, type AudioLanguage } from '@overtone/core'
import postgres from 'postgres'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const dataFile = (language: AudioLanguage) => resolve(here, `../data/lemmas-${language}.tsv`)

const requested = process.argv.slice(2)
const asked = requested.length > 0 ? requested : [...AUDIO_LANGUAGES]

for (const language of asked) {
  if (!AUDIO_LANGUAGES.includes(language as AudioLanguage)) {
    console.error(`unknown language ${language}; expected one of ${AUDIO_LANGUAGES.join(', ')}`)
    process.exit(1)
  }
}

const languages = (asked as readonly AudioLanguage[]).filter((language) => {
  if (existsSync(dataFile(language))) return true
  if (requested.length > 0) {
    console.error(`${dataFile(language)} is missing. Run: pnpm fetch:lemmas ${language}`)
    process.exit(1)
  }
  console.log(`skipping ${language}: no data file yet`)
  return false
})

if (languages.length === 0) {
  console.error('nothing to load. Run: pnpm fetch:lemmas')
  process.exit(1)
}

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 1, onnotice: () => {} })

/** Words whose grouping is worth seeing after a load, per language. */
const SAMPLES: Record<AudioLanguage, readonly string[]> = {
  pt: ['falei', 'falando', 'fui', 'disse', 'gravações', 'casas', 'país'],
  en: ['was', 'went', 'children', 'mice', 'running', 'said', 'better'],
}

try {
  for (const language of languages) {
    const started = Date.now()

    // Only this language's rows. The other half of the dictionary stays put.
    await sql`delete from public.lemmas where language = ${language}`

    // The file is language<TAB>form<TAB>lemma, which is the column order here.
    const writable = await sql`
      copy public.lemmas (language, form, lemma) from stdin with (format text, delimiter E'\t')
    `.writable()

    await pipeline(createReadStream(dataFile(language)), writable)

    const rows = await sql<Array<{ count: number }>>`
      select count(*)::int from public.lemmas where language = ${language}
    `
    const seconds = ((Date.now() - started) / 1000).toFixed(1)

    console.log(
      `${language}: loaded ${(rows[0]?.count ?? 0).toLocaleString()} pairs in ${seconds}s`,
    )

    const samples = await sql<Array<{ form: string; lemma: string }>>`
      select form, lemma from public.lemmas
       where language = ${language} and form = any(${[...(SAMPLES[language] ?? [])]})
       order by form
    `
    for (const { form, lemma } of samples) console.log(`  ${form.padEnd(11)} -> ${lemma}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await sql.end()
}
