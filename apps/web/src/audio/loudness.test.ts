// US-040 · "Splitting never cuts a word in half"
import { describe, expect, it } from 'vitest'
import { FRAME_MS, loudnessProfile } from './loudness.js'

const SAMPLE_RATE = 16_000

/** `ms` of a tone at `level`, as raw mono samples. */
const tone = (ms: number, level: number): number[] =>
  Array.from({ length: Math.round((ms / 1000) * SAMPLE_RATE) }, (_, at) =>
    // A real waveform swings either side of zero, which is the whole reason
    // loudness is a root-mean-square rather than an average.
    level * Math.sin((at / SAMPLE_RATE) * 2 * Math.PI * 440),
  )

describe('loudnessProfile', () => {
  it('gives one entry per frame of audio', () => {
    const samples = Float32Array.from(tone(1_000, 0.5))

    expect(loudnessProfile(samples, SAMPLE_RATE)).toHaveLength(1_000 / FRAME_MS)
  })

  it('reads a loud stretch as louder than a quiet one', () => {
    const profile = loudnessProfile(
      Float32Array.from([...tone(200, 0.9), ...tone(200, 0.02)]),
      SAMPLE_RATE,
    )
    const half = profile.length / 2

    expect(profile[2] ?? 0).toBeGreaterThan((profile[half + 2] ?? 0) * 10)
  })

  /*
   * A sine swings symmetrically about zero, so its mean is zero however
   * loud it is. An implementation that averaged the samples rather than
   * their squares would read every tone as silence — and would have found
   * no gaps anywhere, silently leaving the cuts where they already were.
   */
  it('does not read a loud waveform as silent because it is symmetrical', () => {
    const profile = loudnessProfile(Float32Array.from(tone(200, 0.8)), SAMPLE_RATE)

    for (const frame of profile) expect(frame).toBeGreaterThan(0.1)
  })

  it('reads true silence as zero', () => {
    const profile = loudnessProfile(new Float32Array(SAMPLE_RATE), SAMPLE_RATE)

    expect([...profile].every((frame) => frame === 0)).toBe(true)
  })

  it.each([0, 1])('survives %o samples', (count) => {
    expect(() => loudnessProfile(new Float32Array(count), SAMPLE_RATE)).not.toThrow()
  })

  // A two-hour episode is 115 million samples. The profile is what gets
  // walked ten times over, so it has to be small.
  it('is small enough to walk repeatedly', () => {
    const profile = loudnessProfile(new Float32Array(SAMPLE_RATE * 60), SAMPLE_RATE)

    expect(profile.length).toBe((60 * 1000) / FRAME_MS)
  })
})
