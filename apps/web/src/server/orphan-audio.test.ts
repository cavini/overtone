// US-041 · the audio of an episode that no longer exists
import { describe, expect, it } from 'vitest'
import { orphanedAudio } from './orphan-audio.js'

const LIVE = '11111111-1111-4111-8111-111111111111'
const GONE = '22222222-2222-4222-8222-222222222222'

const keyFor = (episodeId: string, index = 0) => `episodes/${episodeId}/chunk-${index}.wav`

describe('orphanedAudio', () => {
  it('sweeps the audio of an episode that is gone', () => {
    expect(orphanedAudio([keyFor(GONE)], new Set([LIVE]))).toEqual({ sweep: [keyFor(GONE)] })
  })

  it('leaves the audio of an episode that is still here', () => {
    expect(orphanedAudio([keyFor(LIVE)], new Set([LIVE]))).toEqual({ sweep: [] })
  })

  it('sweeps every chunk of a gone episode, not just the first', () => {
    const keys = [keyFor(GONE, 0), keyFor(GONE, 1), keyFor(GONE, 12)]

    expect(orphanedAudio(keys, new Set([LIVE]))).toEqual({ sweep: keys })
  })

  /*
   * The property that matters most. A sweep that deleted what it did not
   * recognise would empty somebody's bucket the first time the key layout
   * changed, or the first time anything else was stored beside it.
   */
  it.each([
    ['a folder marker', 'episodes/'],
    ['something else entirely', 'exports/report.pdf'],
    ['a key with no episode in it', 'episodes/chunk-0.wav'],
    ['an id that is not one', 'episodes/not-a-uuid/chunk-0.wav'],
    ['a different extension', `episodes/${GONE}/chunk-0.mp3`],
    ['a path walking upwards', `episodes/${GONE}/../../secrets`],
    ['an empty string', ''],
  ])('never touches %s', (_what, key) => {
    expect(orphanedAudio([key], new Set([LIVE]))).toEqual({ sweep: [] })
  })

  /*
   * An empty library with audio still stored is indistinguishable from a
   * database read that failed, and the two call for opposite actions. Only
   * one of the two mistakes is expensive, so it refuses.
   */
  it('refuses to sweep when the library came back empty', () => {
    expect(orphanedAudio([keyFor(GONE)], new Set())).toEqual({ refuse: 'no-live-episodes' })
  })

  it('has nothing to say about an empty library with nothing stored', () => {
    expect(orphanedAudio([], new Set())).toEqual({ sweep: [] })
  })

  // A bucket holding only things it does not recognise is not an empty
  // library — there is simply nothing of ours in it.
  it('does not refuse over keys that are not ours', () => {
    expect(orphanedAudio(['exports/report.pdf'], new Set())).toEqual({ sweep: [] })
  })
})
