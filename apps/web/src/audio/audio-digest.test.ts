// US-009
import { describe, expect, it } from 'vitest'
import { audioDigest } from './audio-digest.js'

/*
 * SHA-256 of `overtone`, computed by something other than this code.
 *
 * A digest checked against itself proves only that it is consistent, which
 * is no use: the server is matching these against what it stored, so the
 * number has to be the one the rest of the world calls SHA-256.
 */
const OVERTONE = '59328e374e8008a04b8cebbd1a08e21975c9da2f917e08a5dff3cfffe8a32aca'

const fileOf = (bytes: string, name: string): File =>
  new File([new TextEncoder().encode(bytes)], name, { type: 'audio/mpeg' })

describe('a fingerprint of the audio', () => {
  it('is the SHA-256 of the bytes, in lower-case hex', async () => {
    await expect(audioDigest(fileOf('overtone', 'ep-201.mp3'))).resolves.toBe(OVERTONE)
  })

  /*
   * The whole point of the thing.
   *
   * The same recording arrives as `ep-201.mp3` one day and
   * `Chuva de Canivetes 201.m4a` the next, and a name cannot tell you it is
   * the same two hours of audio.
   */
  it('does not change when the file is renamed', async () => {
    const [first, second] = await Promise.all([
      audioDigest(fileOf('overtone', 'ep-201.mp3')),
      audioDigest(fileOf('overtone', 'Chuva de Canivetes 201.m4a')),
    ])

    expect(first).toBe(second)
  })

  it('changes when a single byte does', async () => {
    const [first, second] = await Promise.all([
      audioDigest(fileOf('overtone', 'ep-201.mp3')),
      audioDigest(fileOf('overtOne', 'ep-201.mp3')),
    ])

    expect(first).not.toBe(second)
  })

  // Every byte is two characters, so a digest that lost its leading zeroes
  // would be short — and would collide with whatever else lost one.
  it('is always sixty-four characters', async () => {
    await expect(audioDigest(fileOf('', 'empty.mp3'))).resolves.toHaveLength(64)
  })
})
