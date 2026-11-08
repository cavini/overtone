// US-013
//
// The show opens on music with English lyrics. Detecting the language from
// the start of the file therefore answers "English" for every episode the
// group has ever recorded — so the probes deliberately sample the middle,
// and the test that matters most here is the one asserting none of them
// lands anywhere near the opening.
import { describe, expect, it } from 'vitest'
import { PROBE_MS, planLanguageProbes } from './language-probe.js'

const minutes = (n: number): number => n * 60_000

describe('deciding where to listen for the language', () => {
  // 1 h 40 m to 2 h is the show's normal length, not an edge case.
  const episode = minutes(105)

  it('never samples the intro', () => {
    for (const probe of planLanguageProbes(episode)) {
      expect(probe.startMs).toBeGreaterThan(minutes(5))
    }
  })

  it('never samples the outro either', () => {
    for (const probe of planLanguageProbes(episode)) {
      expect(probe.endMs).toBeLessThan(episode - minutes(5))
    }
  })

  /*
   * Three, spread out, rather than one longer listen in one place.
   *
   * A single window is one mid-roll sting or one English anecdote away from
   * deciding the whole episode, and the decision picks the stop-word list,
   * the stemmer and the dictionary half that every count is then computed
   * with. Three windows that have to agree cost 90 audio-seconds of a
   * 7 200-second hour and turn one unlucky passage into a minority.
   */
  it('listens in three places', () => {
    expect(planLanguageProbes(episode)).toHaveLength(3)
  })

  it('spreads them across the conversation', () => {
    const [first, second, third] = planLanguageProbes(episode)

    expect(first?.startMs).toBeLessThan(second?.startMs ?? 0)
    expect(second?.startMs).toBeLessThan(third?.startMs ?? 0)
  })

  /*
   * Thirty seconds because that is exactly what the detector reads.
   *
   * Whisper identifies the language from a single 30-second window, so a
   * shorter probe is padded and a longer one is charged for in full and
   * then ignored past the first half minute.
   */
  it('listens for as long as the detector actually reads', () => {
    for (const probe of planLanguageProbes(episode)) {
      expect(probe.endMs - probe.startMs).toBe(PROBE_MS)
    }
  })

  it('never overlaps two probes', () => {
    const probes = planLanguageProbes(minutes(2))

    for (let at = 1; at < probes.length; at += 1) {
      expect(probes[at]?.startMs).toBeGreaterThanOrEqual(probes[at - 1]?.endMs ?? 0)
    }
  })

  // A clip too short to hold three separated windows gets fewer, not three
  // overlapping ones that would vote on the same audio three times.
  it('asks for fewer when the audio is too short to spread them', () => {
    expect(planLanguageProbes(45_000).length).toBeLessThan(3)
  })

  it('stays inside the audio it was given', () => {
    for (const probe of planLanguageProbes(20_000)) {
      expect(probe.startMs).toBeGreaterThanOrEqual(0)
      expect(probe.endMs).toBeLessThanOrEqual(20_000)
    }
  })

  it('has nothing to listen to in no audio', () => {
    expect(planLanguageProbes(0)).toEqual([])
  })
})
