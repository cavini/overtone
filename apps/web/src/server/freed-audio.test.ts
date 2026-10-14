// US-050 · an episode's audio is freed as it is transcribed, not at the end
import { describe, expect, it } from 'vitest'
import { freedAudio } from './freed-audio.js'

const EPISODE = 'ep-1'

describe('freedAudio', () => {
  it('frees the chunk that was just transcribed', () => {
    expect(freedAudio(EPISODE, { state: 'transcribed', chunkIndex: 3, remaining: 9 }, 13)).toEqual([
      'episodes/ep-1/chunk-3.wav',
    ])
  })

  it('sweeps every chunk once the episode is ready', () => {
    expect(freedAudio(EPISODE, { state: 'ready' }, 3)).toEqual([
      'episodes/ep-1/chunk-0.wav',
      'episodes/ep-1/chunk-1.wav',
      'episodes/ep-1/chunk-2.wav',
    ])
  })

  /*
   * The whole reason this is a function and not an inline call. Freeing audio
   * on a failure would make the episode unrecoverable: the next run reads
   * `transcribedIndexes`, sees the chunk is not there, and asks storage for
   * audio that has been deleted — so a transcriber hiccup would cost the
   * upload rather than a retry.
   */
  it('keeps the audio when a chunk fails, so it can be retried', () => {
    expect(
      freedAudio(EPISODE, { state: 'failed', failure: { code: 'PROVIDER_UNAVAILABLE' } }, 13),
    ).toEqual([])
  })

  it('keeps the audio while waiting for the allowance to refill', () => {
    expect(
      freedAudio(
        EPISODE,
        { state: 'waiting', reason: 'HOURLY_ALLOWANCE_EXHAUSTED', retryAfterMs: 60_000 },
        13,
      ),
    ).toEqual([])
  })
})
