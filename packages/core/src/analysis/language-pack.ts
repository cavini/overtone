import { COLLOQUIAL_LEMMAS } from './colloquial.js'
import { splitContractions } from './contractions.js'
import { stemEnglish } from './stem-en.js'
import { stem } from './stem.js'
import { splitEnclitics } from './enclitics.js'
import { FILLERS_EN, STOP_WORDS_EN } from './vocabulary-en.js'
import { FILLERS, STOP_WORDS } from './vocabulary.js'

/**
 * Everything about the analysis that depends on the language being analysed.
 *
 * Gathered into one object because the alternative — a `language` check
 * inside the tokeniser, another in the classifier, another in the lemmatiser
 * — is how a pipeline ends up half-translated. With a pack, adding a
 * language is writing a pack, and forgetting a piece of one is a type error
 * rather than a silently Portuguese result.
 */
export interface LanguagePack {
  /** Hidden from the default view, never from storage. */
  readonly stopWords: ReadonlySet<string>
  /** Non-lexical vocalisations, whose *rate* is itself a number. */
  readonly fillers: ReadonlySet<string>
  /** Where the dictionary is right about the language and wrong about people. */
  readonly overrides: Readonly<Record<string, string>>
  /**
   * Splits one whitespace-delimited word into the words it really is.
   *
   * Portuguese writes two words joined by a hyphen (`diga-me`); English
   * joins them with an apostrophe (`it's`). Same problem, different mark, and
   * neither rule is safe to run on the other language.
   */
  readonly splitWord: (word: string) => string[]
  /** The out-of-dictionary fallback. Plurals only, in both languages. */
  readonly stem: (surface: string) => string
  /**
   * The Postgres text-search configuration that matches this language.
   *
   * Named here so that the index, the query and the analysis cannot drift
   * apart: a search that stemmed with a different configuration from the one
   * its index was built on would quietly stop using the index.
   */
  readonly textSearchConfiguration: string
}

const PORTUGUESE: LanguagePack = {
  stopWords: STOP_WORDS,
  fillers: FILLERS,
  overrides: COLLOQUIAL_LEMMAS,
  splitWord: splitEnclitics,
  stem,
  textSearchConfiguration: 'portuguese',
}

/**
 * No colloquial overrides, and that is a statement rather than a gap.
 *
 * Every Portuguese entry was found in a real episode: `cara` was the
 * most-said word of a two-hour recording and the dictionary reported 311 of
 * them as "expensive". There is no English episode to learn from yet, and
 * inventing corrections for a register nobody has recorded would be guessing
 * where the Portuguese list is evidence.
 */
const ENGLISH: LanguagePack = {
  stopWords: STOP_WORDS_EN,
  fillers: FILLERS_EN,
  overrides: {},
  splitWord: splitContractions,
  stem: stemEnglish,
  textSearchConfiguration: 'english',
}

const PACKS = { pt: PORTUGUESE, en: ENGLISH } as const

/**
 * The languages the analysis can actually handle.
 *
 * Derived from the packs rather than declared, and deliberately a different
 * type from the domain's `AudioLanguage`. They hold the same two values
 * today, and they answer different questions: one is what the transcriber
 * can be asked for, the other is what this pipeline has a stop-word list, a
 * stemmer and a splitter for. If a third language is ever offered for
 * transcription before its pack exists, `languagePack(episode.language)`
 * should stop compiling — which is only possible while the two are separate.
 */
export type PackedLanguage = keyof typeof PACKS

export const PACKED_LANGUAGES = Object.keys(PACKS) as readonly PackedLanguage[]

export function languagePack(language: PackedLanguage): LanguagePack {
  return PACKS[language]
}
