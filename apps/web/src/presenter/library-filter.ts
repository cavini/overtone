/**
 * Normalisation for comparing a typed word against a title.
 *
 * NFC and lower case, and that is all — the same rule the analysis engine
 * uses on the words themselves. Accents are never stripped: `por` and `pôr`,
 * `esta` and `está` are different words in Portuguese, and a filter that
 * folded them would be the one place in the app that disagreed with every
 * count on the page.
 *
 * NFC is not a formality. A title comes from a filename and macOS hands
 * filenames over decomposed, so the accent in a stored title can be two
 * characters where the same accent typed into a browser is one.
 */
const fold = (text: string): string => text.normalize('NFC').toLowerCase().trim()

/**
 * The episodes whose title holds what was typed.
 *
 * No request goes out for this. A library of a few dozen episodes is already
 * on the page by the time anybody starts typing, and a round trip per
 * keystroke would make a filter slower than reading the list.
 *
 * Generic over the row, because the only thing being matched is the title
 * and the caller is the one that knows what else a row carries.
 */
export function episodesMatching<Episode extends { readonly title: string }>(
  episodes: readonly Episode[],
  query: string,
): readonly Episode[] {
  const typed = fold(query)
  if (typed === '') return episodes

  return episodes.filter((episode) => fold(episode.title).includes(typed))
}
