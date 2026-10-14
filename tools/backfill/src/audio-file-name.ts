/**
 * What to call the file, which is how the app learns what it is.
 *
 * `/api/episodes/start` takes a **filename** where it looks like it takes a
 * title. The server reads the programme and the episode number out of it
 * (`readEpisodeName`), files the episode under that programme, and uses the
 * number to look the published title up in the feed. Nothing else carries
 * that information — there is no field for either.
 *
 * So the shape matters in two ways that both fail quietly:
 *
 *  - **The number has to be the last word, and all digits.** A `#` in front
 *    of it, which is how this feed writes its titles, makes the last word
 *    `#001`, which is not a number — the episode is then filed under no
 *    programme at all and numbered one past whatever was uploaded last.
 *  - **What is left is the programme.** Spelt differently from the feed's
 *    own show name and the episode lands in a programme of one.
 */

/** Three digits, so `001` sorts before `010` wherever it is listed. */
const DIGITS = 3

/**
 * Only MP3 is ever written, because that is what a podcast enclosure is.
 *
 * Nothing downstream reads it: ffmpeg sniffs the container rather than
 * trusting a name, and the server strips the extension before parsing. It is
 * here so the file on disk is openable by whoever goes looking at it.
 */
const EXTENSION = 'mp3'

export function audioFileName(show: string, episodeNumber: number): string {
  /*
   * Letters and digits survive; everything else is a separator.
   *
   * `\p{L}` rather than `a-z`, because accents are never stripped in this
   * project — and this name is the title the library falls back to when the
   * feed cannot be reached, so a stripped one would show up as a
   * misspelling.
   */
  const kebab = show
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')

  return `${kebab}-${String(episodeNumber).padStart(DIGITS, '0')}.${EXTENSION}`
}
