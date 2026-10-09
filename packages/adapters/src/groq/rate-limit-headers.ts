import type { ObservedAllowance } from '@overtone/core'

/** `ms` first: it ends in `s`, and seconds would swallow it. */
const UNITS_MS: ReadonlyArray<readonly [suffix: string, ms: number]> = [
  ['ms', 1],
  ['h', 60 * 60_000],
  ['m', 60_000],
  ['s', 1_000],
]

const SEGMENT = /^(\d+(?:\.\d+)?)(ms|[hms])/u

/**
 * Reads the provider's duration format: `7m30s`, `14m23.5s`, `43.2s`, `500ms`.
 *
 * Returns `undefined` for anything it does not fully recognise, rather than
 * falling back to zero. A reported `0s` is a full bucket; an unparseable
 * header is not, and conflating them would send a chunk into a drained
 * balance and fail the episode at the provider.
 */
export function parseDuration(text: string): number | undefined {
  let rest = text.trim()
  if (rest.length === 0) return undefined

  let total = 0
  while (rest.length > 0) {
    const match = SEGMENT.exec(rest)
    if (match === null) return undefined

    const [segment, amount, suffix] = match
    const unit = UNITS_MS.find(([candidate]) => candidate === suffix)
    /* c8 ignore next -- unreachable: the pattern only matches these suffixes. */
    if (unit === undefined) return undefined

    total += Number(amount) * unit[1]
    rest = rest.slice(segment.length)
  }

  return total
}

function count(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name)
  if (raw === null || raw.trim().length === 0) return undefined

  const seconds = Number(raw)
  return Number.isFinite(seconds) ? seconds * 1_000 : undefined
}

/**
 * The balance the provider reported on this response.
 *
 * `undefined` when the headers are absent or unreadable, so that a provider
 * which stops reporting cannot be mistaken for one reporting an empty bucket.
 * The caller then falls back to its own arithmetic (ADR 0021).
 */
export function readAllowance(headers: Headers): ObservedAllowance | undefined {
  const limitAudioMs = count(headers, 'x-ratelimit-limit-audio-seconds')
  const remainingAudioMs = count(headers, 'x-ratelimit-remaining-audio-seconds')
  const reset = headers.get('x-ratelimit-reset-audio-seconds')
  const refillsFullyInMs = reset === null ? undefined : parseDuration(reset)

  if (limitAudioMs === undefined || remainingAudioMs === undefined) return undefined
  if (refillsFullyInMs === undefined) return undefined

  return { limitAudioMs, remainingAudioMs, refillsFullyInMs }
}
