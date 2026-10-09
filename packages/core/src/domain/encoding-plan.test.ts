// US-040 · ADR 0018
import { describe, expect, it } from 'vitest'
import { MAX_EPISODE_MS, planEncoding, UPLOAD_BUDGET_BYTES } from './encoding-plan.js'

const minutes = (count: number) => count * 60_000

const planFor = (durationMs: number) => {
  const outcome = planEncoding(durationMs)
  if (!outcome.ok) throw new Error(`expected a plan, got ${outcome.failure.code}`)
  return outcome.plan
}

describe('planEncoding', () => {
  // Whisper downsamples everything to 16 kHz mono before transcribing, so
  // anything above that is bytes we pay to move and the model discards.
  it('always targets 16 kHz mono', () => {
    for (const duration of [minutes(1), minutes(60), minutes(120), minutes(150)]) {
      expect(planFor(duration)).toMatchObject({ sampleRateHz: 16_000, channels: 1 })
    }
  })

  it('spends the best bitrate that still fits', () => {
    expect(planFor(minutes(10)).bitrateKbps).toBe(32)
    expect(planFor(minutes(60)).bitrateKbps).toBe(32)
  })

  it('steps the bitrate down as the episode gets longer', () => {
    const ladder = [10, 60, 100, 120, 150].map((m) => planFor(minutes(m)).bitrateKbps)
    expect(ladder).toEqual([...ladder].sort((a, b) => b - a))
  })

  // The two lengths that actually matter: the show runs 1h40 to 2h.
  it('fits a two-hour episode in one upload', () => {
    const plan = planFor(minutes(120))
    expect(plan.estimatedBytes).toBeLessThan(UPLOAD_BUDGET_BYTES)
    expect(plan.bitrateKbps).toBeGreaterThanOrEqual(24)
  })

  it('fits a one-hour-forty episode in one upload', () => {
    const plan = planFor(minutes(100))
    expect(plan.estimatedBytes).toBeLessThan(UPLOAD_BUDGET_BYTES)
    expect(plan.bitrateKbps).toBeGreaterThanOrEqual(24)
  })

  it('never exceeds the budget at any supported length', () => {
    for (let m = 1; m <= 150; m += 1) {
      expect(planFor(minutes(m)).estimatedBytes).toBeLessThan(UPLOAD_BUDGET_BYTES)
    }
  })

  it('leaves headroom under the hard service cap', () => {
    expect(UPLOAD_BUDGET_BYTES).toBeLessThan(25 * 1024 * 1024)
  })

  // Measured against a real 2 h 06 m episode: asked for 24 kbps, the encoder
  // produced 24.9. A naive duration × bitrate underestimates by about 4%, and
  // an optimistic estimate fails at the end of a long upload.
  it('estimates above a naive duration times bitrate', () => {
    const plan = planFor(minutes(126))
    const naive = 126 * 60 * ((plan.bitrateKbps * 1000) / 8)
    expect(plan.estimatedBytes).toBeGreaterThan(naive)
  })

  // The episode that produced the measurement. 22.58 MB in reality.
  it('keeps a real two-hour-six-minute episode inside the cap', () => {
    const plan = planFor(126 * 60_000 + 31_000)
    expect(plan.bitrateKbps).toBe(24)
    expect(plan.estimatedBytes).toBeLessThan(25 * 1024 * 1024)
    expect(plan.estimatedBytes).toBeGreaterThan(22 * 1024 * 1024)
  })

  it('refuses an episode past the supported length, with the real number', () => {
    const outcome = planEncoding(MAX_EPISODE_MS + 1)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) throw new Error('expected a refusal')
    expect(outcome.failure).toEqual({
      code: 'EPISODE_TOO_LONG',
      maxMinutes: 150,
      durationMinutes: 151,
    })
  })

  it('accepts exactly the supported length', () => {
    expect(planEncoding(MAX_EPISODE_MS).ok).toBe(true)
  })

  it('refuses audio with no duration', () => {
    for (const duration of [0, -1]) {
      const outcome = planEncoding(duration)
      expect(outcome.ok).toBe(false)
      if (outcome.ok) throw new Error('expected a refusal')
      expect(outcome.failure.code).toBe('UNREADABLE_AUDIO')
    }
  })

  it('is deterministic', () => {
    expect(planEncoding(minutes(120))).toEqual(planEncoding(minutes(120)))
  })
})
