/**
 * The library, read one programme at a time.
 *
 * The group publishes several shows and they all land in one library — on
 * purpose, because they share running jokes and search has to reach across
 * every one of them (ADR 0032). That makes grouping a *presentation*
 * concern: nothing below here is partitioned, and nothing above here may
 * assume a section is a boundary.
 */

export interface LibrarySection<Episode> {
  /** The programme, or `undefined` for episodes that belong to none. */
  readonly category: string | undefined
  readonly episodes: readonly Episode[]
}

/** Something with a programme on it, which is all this needs to know. */
interface Categorised {
  readonly category?: string | null
}

/**
 * One section per programme, biggest first, uncategorised last.
 *
 * Biggest first so the show somebody came to read is at the top rather than
 * wherever the alphabet put it, and alphabetical only to break a tie — a
 * list that reorders itself on every upload is worse than one occasionally
 * in the wrong order.
 *
 * The episodes inside a section keep the order they arrived in, which is
 * already the order the library sorted them by. Sorting again here would put
 * the decision in two places, and they would disagree the first time one
 * changed.
 */
export function groupedByCategory<Episode extends Categorised>(
  episodes: readonly Episode[],
): ReadonlyArray<LibrarySection<Episode>> {
  // A Map, because insertion order is the fallback for everything the
  // comparison below treats as equal, and it keeps this one pass.
  const sections = new Map<string | undefined, Episode[]>()

  for (const episode of episodes) {
    // Null and empty mean the same thing as absent: no programme was read
    // out of the filename, because it carried no number.
    const category =
      episode.category === null || episode.category === undefined || episode.category.length === 0
        ? undefined
        : episode.category

    const held = sections.get(category)
    if (held === undefined) sections.set(category, [episode])
    else held.push(episode)
  }

  return [...sections]
    .map(([category, held]) => ({ category, episodes: held }))
    .sort((left, right) => {
      // Whatever has no programme goes last, however many of them there are:
      // a loose upload is not a show and should not head the library.
      if (left.category === undefined) return 1
      if (right.category === undefined) return -1

      const bySize = right.episodes.length - left.episodes.length
      return bySize === 0 ? left.category.localeCompare(right.category, 'pt-BR') : bySize
    })
}
