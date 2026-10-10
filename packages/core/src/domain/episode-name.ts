/**
 * Reading a presentable episode name out of a filename.
 *
 * Files arrive named the way a filesystem likes them — lower case, hyphens,
 * the episode number stuck on the end. Storing that verbatim gave a library
 * that reads like a directory listing rather than like a show.
 *
 * This is a guess, and a cheap one. It is overridden by anything better: if
 * the series knows its own feed, the real title from there wins.
 */

/** Words a title keeps lower case, unless they begin it. */
const SMALL_WORDS = new Set([
  // English
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on',
  'or', 'the', 'to', 'up', 'via', 'vs',
  // Portuguese
  'a', 'as', 'ao', 'aos', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pelo', 'pela', 'por',
  'um', 'uma',
])

/**
 * The largest number that is plausibly an episode.
 *
 * Above this it is a bitrate, a date stamp or a timestamp that happened to
 * end the filename, and reading it as an episode number would sort the
 * library by nonsense.
 */
const HIGHEST_EPISODE = 9_999

export interface EpisodeName {
  readonly title: string
  readonly number?: number
}

/** Capitalised unless it is a small word that is not first. */
function asTitleWord(word: string, first: boolean): string {
  // Something already capitalised is deliberate — an acronym, a name — and
  // lower-casing it would be a worse guess than leaving it.
  if (word !== word.toLocaleLowerCase('pt-BR')) return word

  if (!first && SMALL_WORDS.has(word)) return word

  return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)
}

export function readEpisodeName(filename: string): EpisodeName {
  const withoutExtension = filename.replace(/\.[^.\s]{1,5}$/u, '')
  const words = withoutExtension
    .split(/[\s_-]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)

  // Only a trailing number is the episode. A date at the front is part of
  // the name, and reading it as the number would file a whole month under
  // the same episode.
  const last = words.at(-1)
  const trailing = last !== undefined && /^\d+$/u.test(last) ? Number(last) : undefined
  const number = trailing !== undefined && trailing <= HIGHEST_EPISODE ? trailing : undefined

  const titleWords = number === undefined ? words : words.slice(0, -1)
  const title = titleWords
    .map((word, index) => asTitleWord(word, index === 0))
    .join(' ')

  return number === undefined ? { title } : { title, number }
}
