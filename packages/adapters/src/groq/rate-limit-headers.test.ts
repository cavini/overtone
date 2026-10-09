// US-040 · ADR 0021
import { describe, expect, it } from 'vitest'
import { parseDuration, readAllowance } from './rate-limit-headers.js'

describe('parseDuration', () => {
  // The formats actually observed from the provider.
  it.each([
    ['7m30s', 450_000],
    ['14m23.5s', 863_500],
    ['43.2s', 43_200],
    ['0s', 0],
  ])('reads %s', (text, expected) => {
    expect(parseDuration(text)).toBe(expected)
  })

  // `ms` ends in `s`. A pattern that looks for seconds first reads "500ms"
  // as 500 seconds — a thousandfold error, in the direction of waiting
  // instead of sending.
  it('does not mistake milliseconds for seconds', () => {
    expect(parseDuration('500ms')).toBe(500)
  })

  it('reads hours', () => {
    expect(parseDuration('1h2m3s')).toBe(3_723_000)
  })

  it('combines a unit it has seen with one it has not', () => {
    expect(parseDuration('2m500ms')).toBe(120_500)
  })

  // Anything unrecognised must be absent rather than zero. Zero means "the
  // balance is already full", which would send a chunk into a drained bucket.
  it.each(['', 'soon', '7 minutes', 'NaNs', '--'])('rejects %o', (text) => {
    expect(parseDuration(text)).toBeUndefined()
  })
})

const headersFor = (extra: Record<string, string> = {}): Headers =>
  new Headers({
    'x-ratelimit-limit-audio-seconds': '7200',
    'x-ratelimit-remaining-audio-seconds': '6300',
    'x-ratelimit-reset-audio-seconds': '7m30s',
    ...extra,
  })

describe('readAllowance', () => {
  it('reads the balance the provider reported', () => {
    expect(readAllowance(headersFor())).toEqual({
      limitAudioMs: 7_200_000,
      remainingAudioMs: 6_300_000,
      refillsFullyInMs: 450_000,
    })
  })

  // Measured in experiment 0003: the reset is the time for the deficit to
  // refill, so the two agree. If they ever stop agreeing, the refill rate we
  // pace on is wrong, and that is worth knowing from real traffic.
  it('agrees with the measured refill rate', () => {
    const observed = readAllowance(headersFor())
    const deficit = (observed?.limitAudioMs ?? 0) - (observed?.remainingAudioMs ?? 0)

    expect(deficit / (observed?.refillsFullyInMs ?? 1)).toBe(2)
  })

  // A provider that stops sending the headers must not look like a provider
  // reporting an empty bucket.
  it.each([
    'x-ratelimit-remaining-audio-seconds',
    'x-ratelimit-limit-audio-seconds',
    'x-ratelimit-reset-audio-seconds',
  ])('reports nothing when %s is missing', (name) => {
    const headers = headersFor()
    headers.delete(name)

    expect(readAllowance(headers)).toBeUndefined()
  })

  it('reports nothing when a count is not a number', () => {
    expect(readAllowance(headersFor({ 'x-ratelimit-remaining-audio-seconds': 'lots' }))).toBeUndefined()
  })

  it('reports an empty bucket as empty, not as missing', () => {
    expect(readAllowance(headersFor({ 'x-ratelimit-remaining-audio-seconds': '0' }))?.remainingAudioMs).toBe(0)
  })

  // Fractional seconds appear in the reset header, so assume they can appear
  // in the counts too.
  it('keeps fractional seconds', () => {
    expect(readAllowance(headersFor({ 'x-ratelimit-remaining-audio-seconds': '6300.5' }))?.remainingAudioMs).toBe(6_300_500)
  })
})
