import { createHash } from 'node:crypto'

/**
 * A fingerprint of the audio, which is how a resumed run knows what it has.
 *
 * `/api/episodes/start` dedupes on this: the same recording arrives as
 * `ep-201.mp3` one day and `chuva-de-canivetes-201.mp3` the next, and
 * re-transcribing a two-hour episode spends roughly a third of a day's free
 * allowance to learn nothing. It is the app's own answer to "do you already
 * have this", so it is the one this tool trusts over any list it keeps.
 *
 * **The same hash the browser computes** — SHA-256 of the file, lower-case
 * hex — because an episode uploaded by the tool and the same episode
 * uploaded from a tab have to collide. A different spelling of the digest
 * would quietly give one episode two rows.
 *
 * Fed a stream rather than a buffer: an episode is around a hundred
 * megabytes, and the point of downloading to a file is not to hold it in
 * memory afterwards.
 */
export async function digestOf(bytes: AsyncIterable<Uint8Array>): Promise<string> {
  const hash = createHash('sha256')

  for await (const piece of bytes) hash.update(piece)

  return hash.digest('hex')
}
