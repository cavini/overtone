/**
 * Downloads the Portuguese lemma list and writes it out for loading.
 *
 * Deliberately a script rather than a migration with the data inlined: the
 * source is 19 MB of text, which does not belong in git history. Run it once
 * per environment; the output is gitignored.
 *
 *   pnpm fetch:lemmas
 *
 * The parsing itself lives in `@overtone/adapters/lemmas` and is covered by
 * unit tests — including the Windows line endings, the byte-order mark, the
 * junk rows, and the 213 lemmas that need protecting from the stemmer. This
 * file only moves bytes around.
 *
 * Source: https://github.com/michmech/lemmatization-lists  (ODbL)
 * See ATTRIBUTION.md.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLemmaList } from '../packages/adapters/src/lemmas/parse-lemma-list.js'

const SOURCE =
  'https://raw.githubusercontent.com/michmech/lemmatization-lists/master/lemmatization-pt.txt'

const here = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(here, '../packages/db/data/lemmas-pt.tsv')

const asTsv = (pairs: ReadonlyArray<readonly [string, string]>): string =>
  pairs.map(([form, lemma]) => `${form}\t${lemma}`).join('\n') + '\n'

console.log(`fetching ${SOURCE}`)
const response = await fetch(SOURCE)

if (!response.ok) {
  console.error(`download failed: ${response.status} ${response.statusText}`)
  process.exit(1)
}

const text = await response.text()
console.log(`  ${(text.length / 1024 / 1024).toFixed(1)} MB downloaded`)

const pairs = parseLemmaList(text)
const protective = pairs.filter(([form, lemma]) => form === lemma).length

await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, asTsv(pairs), 'utf8')

console.log(`  ${pairs.length.toLocaleString()} pairs kept`)
console.log(`  ${protective} protective rows added for lemmas the stemmer would cut`)
console.log(`  written to ${outPath}`)
console.log('\nThe table it loads into does not exist yet. Until it does, this')
console.log('file is the dictionary: the analysis works without it, grouping')
console.log('plurals via the stemmer and marking those groupings heuristic.')
