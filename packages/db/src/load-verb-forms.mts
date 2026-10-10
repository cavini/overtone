import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

/**
 * Loads the verb-form set, which is what tells an invented verb from a real
 * one (ADR 0029).
 *
 * Replaces only the language it is loading, so loading Portuguese never
 * removes English.
 */
const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const language = process.argv[2] ?? 'pt'
const dataFile = resolve(here, `../data/verb-forms-${language}.tsv`)
const url = process.env['MIGRATION_DATABASE_URL'] ?? process.env['DATABASE_URL']

if (url === undefined || url.length === 0) {
  console.error('DATABASE_URL is not set. See .env.example.')
  process.exit(1)
}

if (!existsSync(dataFile)) {
  console.error(`${dataFile} is missing. Run: pnpm fetch:verb-forms`)
  process.exit(1)
}

const forms = readFileSync(dataFile, 'utf8')
  .split('\n')
  .map((line) => line.split('\t')[1]?.trim())
  .filter((form): form is string => form !== undefined && form.length > 0)

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} })

await sql`delete from verb_forms where language = ${language}`

// In batches: a single insert of two hundred thousand rows exceeds what the
// driver will put in one statement.
const BATCH = 5_000
for (let at = 0; at < forms.length; at += BATCH) {
  const slice = forms.slice(at, at + BATCH).map((form) => ({ language, form }))
  await sql`insert into verb_forms ${sql(slice, 'language', 'form')} on conflict do nothing`
}

const [count] = await sql`select count(*)::int as n from verb_forms where language = ${language}`
console.log(`${count?.n.toLocaleString()} verb forms loaded for ${language}`)

await sql.end()
