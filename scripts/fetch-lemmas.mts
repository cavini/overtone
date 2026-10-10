/**
 * Downloads the lemma lists and writes them out for loading.
 *
 * Deliberately a script rather than a migration with the data inlined: the
 * Portuguese source alone is 19 MB of text, which does not belong in git
 * history. Run it once per environment; the output is gitignored.
 *
 *   pnpm fetch:lemmas          # both languages
 *   pnpm fetch:lemmas en       # just one
 *
 * The parsing itself lives in `@overtone/adapters/lemmas` and is covered by
 * unit tests — including the Windows line endings, the byte-order mark, the
 * junk rows, and the lemmas that need protecting from the stemmer. This file
 * only moves bytes around.
 *
 * Source: https://github.com/michmech/lemmatization-lists  (ODbL)
 * See ATTRIBUTION.md.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUDIO_LANGUAGES, type AudioLanguage } from '../packages/core/src/domain/audio-language.js'
import { parseLemmaList } from '../packages/adapters/src/lemmas/parse-lemma-list.js'

const SOURCE = (language: AudioLanguage) =>
  `https://raw.githubusercontent.com/michmech/lemmatization-lists/master/lemmatization-${language}.txt`

const here = dirname(fileURLToPath(import.meta.url))
const outPath = (language: AudioLanguage) =>
  resolve(here, `../packages/db/data/lemmas-${language}.tsv`)

/**
 * `language<TAB>form<TAB>lemma`, which is the column order the loader's
 * `COPY` expects.
 *
 * The language is repeated on every line even though the filename already
 * carries it. That is what lets the loader stream the file straight into
 * Postgres instead of transforming it line by line — and the file is a load
 * artefact, not a copy of the source.
 */
const asTsv = (
  language: AudioLanguage,
  pairs: ReadonlyArray<readonly [string, string]>,
): string => pairs.map(([form, lemma]) => `${language}\t${form}\t${lemma}`).join('\n') + '\n'

const requested = process.argv.slice(2)
const languages = requested.length > 0 ? requested : AUDIO_LANGUAGES

for (const language of languages) {
  if (!AUDIO_LANGUAGES.includes(language as AudioLanguage)) {
    console.error(`unknown language ${language}; expected one of ${AUDIO_LANGUAGES.join(', ')}`)
    process.exit(1)
  }
}

for (const language of languages as readonly AudioLanguage[]) {
  console.log(`fetching ${SOURCE(language)}`)
  const response = await fetch(SOURCE(language))

  if (!response.ok) {
    console.error(`download failed: ${response.status} ${response.statusText}`)
    process.exit(1)
  }

  const text = await response.text()
  console.log(`  ${(text.length / 1024 / 1024).toFixed(1)} MB downloaded`)

  const pairs = parseLemmaList(text, language)
  const protective = pairs.filter(([form, lemma]) => form === lemma).length
  const destination = outPath(language)

  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, asTsv(language, pairs), 'utf8')

  console.log(`  ${pairs.length.toLocaleString()} pairs kept`)
  console.log(`  ${protective} protective rows for lemmas the ${language} stemmer would cut`)
  console.log(`  written to ${destination}\n`)
}

console.log('Load them with: pnpm --filter @overtone/db db:load-lemmas')
