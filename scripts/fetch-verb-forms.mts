import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Downloads the spellings that are verb forms.
 *
 * Source: https://github.com/unimorph/por — UniMorph's Portuguese set,
 * CC-BY-SA 3.0, attributed in `ATTRIBUTION.md`.
 *
 * It exists here to throw out invented verbs. The bundled lemma list maps
 * plain nouns onto infinitives that barely exist — `gato` onto `gatar`,
 * `bebê` onto `beber` — and cannot be repaired from its own contents,
 * because it generated a full paradigm for each invention. UniMorph
 * contains **only** verbs, and has no entry for `gato` at all, so a lemma
 * shaped like an infinitive for a form it has never heard of is wrong
 * (ADR 0029).
 *
 * Only the spellings are kept. Which tense a form is in answers a question
 * nothing here asks, and the file is three times the size with it.
 */
const SOURCE = 'https://raw.githubusercontent.com/unimorph/por/master/por'

const here = dirname(fileURLToPath(import.meta.url))
const destination = resolve(here, '../packages/db/data/verb-forms-pt.tsv')

console.log(`fetching ${SOURCE}`)
const response = await fetch(SOURCE)
if (!response.ok) {
  console.error(`download failed: ${response.status} ${response.statusText}`)
  process.exit(1)
}

const text = await response.text()
console.log(`  ${(text.length / 1024 / 1024).toFixed(1)} MB downloaded`)

const forms = new Set<string>()
for (const line of text.split('\n')) {
  const [, form, features] = line.split('\t')
  // Verb rows only. The set carries nothing else, but the file has a
  // header-ish blank line and the odd malformed row.
  if (form === undefined || features === undefined) continue
  if (!features.startsWith('V')) continue

  const spelling = form.trim().toLowerCase()
  if (spelling.length > 0) forms.add(spelling)
}

await mkdir(dirname(destination), { recursive: true })
await writeFile(
  destination,
  [...forms].sort().map((form) => `pt\t${form}`).join('\n') + '\n',
  'utf8',
)

console.log(`  ${forms.size.toLocaleString()} verb forms kept`)
console.log(`  written to ${destination}\n`)
console.log('Load them with: pnpm --filter @overtone/db db:load-verb-forms')
