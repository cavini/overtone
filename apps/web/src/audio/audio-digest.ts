/**
 * A fingerprint of the audio, computed before anything is uploaded.
 *
 * Names cannot identify an episode: the same recording arrives as
 * `ep-201.mp3` one day and `Chuva de Canivetes 201.m4a` the next, and
 * re-transcribing a two-hour episode spends roughly a third of a day's free
 * allowance to learn nothing.
 *
 * Hashed in the browser rather than on the server because the server never
 * sees the file — a serverless function takes about 4.5 MB of body and the
 * audio goes straight to storage.
 */
export async function audioDigest(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
