// How the analysis grows with the length of an episode.
//
// The whole pipeline runs in one serverless invocation once the last chunk
// lands, over roughly 20 000 words for a two-hour episode. Two stages were
// quadratic in that number and nothing noticed, because every other test
// uses a handful of words where n² and n are the same size:
//
//              5k words   10k      20k      40k     per doubling
//   groupWords    6.5ms   24.4ms   96.2ms  377.6ms     ×3.9
//   toSegments   62.3ms  144.5ms  571.3ms  882.3ms     ×2.4–4.0
//
// Both were a linear scan nested inside a loop. After the fix, at 20 000
// words: groupWords 2.2 ms and toSegments 5.8 ms — 44× and 98× — and both
// double when the input does.
//
// These assertions are about **shape, not speed**. A wall-clock budget
// would fail on a slow CI box and pass on a fast one while hiding a
// regression; a ratio between two sizes on the same machine, in the same
// run, cancels the machine out.
import { describe, expect, it } from 'vitest'
import type { TimedWord } from '../domain/timed-word.js'
import { annotate } from './annotate.js'
import { countTerms } from './count-terms.js'
import { findMentions } from './find-mentions.js'
import { groupWords } from './group-words.js'
import { toSegments } from './to-segments.js'
import { tokeniseTimed } from './tokenise-timed.js'

/*
 * Declared rather than imported. `packages/core` carries neither the DOM lib
 * nor `@types/node`, which is the whole point of it — nothing in here may
 * reach for an environment, and a clock is precisely the sort of thing that
 * leaks in first. Pulling in `@types/node` to time a test would widen what
 * the package is allowed to see, to measure it.
 */
declare const performance: { now: () => number }

const SPOKEN = ['hoje', 'falamos', 'do', 'feijão', 'com', 'guardachuva', 'de', 'novo.']

const wordsOf = (count: number): TimedWord[] =>
  Array.from({ length: count }, (_, at) => ({
    text: SPOKEN[at % SPOKEN.length] ?? 'x',
    startMs: at * 350,
    endMs: at * 350 + 300,
  }))

/** A transcriber segment every fourteen words, which is about five seconds. */
const boundariesOf = (count: number): number[] =>
  Array.from({ length: Math.floor(count / 14) }, (_, at) => at * 14 * 350)

/**
 * The fastest of a few runs.
 *
 * The minimum rather than the mean: a slow run means something else had the
 * CPU, which is noise, while a fast one cannot be faster than the work.
 */
const fastestOf = (run: () => void): number => {
  run()
  let best = Number.POSITIVE_INFINITY
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const from = performance.now()
    run()
    best = Math.min(best, performance.now() - from)
  }

  return best
}

const SMALL = 8_000
const LARGE = SMALL * 8

/*
 * Eight times the input. Linear work takes about 8× as long and quadratic
 * about 64×, so 24 sits three times above the honest answer and well under
 * half the broken one. Wide enough that a loaded CI box does not fail it,
 * narrow enough that a nested scan cannot hide.
 */
const QUADRATIC_WOULD_BE = 24

const grows = (label: string, build: (n: number) => () => void): void => {
  it(`${label} grows with the episode, not with its square`, () => {
    const small = fastestOf(build(SMALL))
    const large = fastestOf(build(LARGE))
    const ratio = large / Math.max(small, 0.01)

    expect(
      ratio,
      `${label}: ${String(SMALL)} words took ${small.toFixed(1)}ms and ${String(LARGE)} took ${large.toFixed(1)}ms — ×${ratio.toFixed(1)} for 8× the input`,
    ).toBeLessThan(QUADRATIC_WOULD_BE)
  })
}

describe('the analysis', () => {
  grows('groupWords', (n) => {
    const words = wordsOf(n)
    const boundaries = boundariesOf(n)
    return () => void groupWords(words, 40, boundaries)
  })

  grows('toSegments', (n) => {
    const words = wordsOf(n)
    const boundaries = boundariesOf(n)
    const tokens = annotate(tokeniseTimed(words, 'pt'), new Map(), 'pt', new Set())
    return () => void toSegments(words, tokens, 40, boundaries)
  })

  grows('tokeniseTimed', (n) => {
    const words = wordsOf(n)
    return () => void tokeniseTimed(words, 'pt')
  })

  grows('countTerms', (n) => {
    const tokens = annotate(tokeniseTimed(wordsOf(n), 'pt'), new Map(), 'pt', new Set())
    return () => void countTerms(tokens)
  })

  grows('findMentions', (n) => {
    const tokens = annotate(tokeniseTimed(wordsOf(n), 'pt'), new Map(), 'pt', new Set())
    const topic = { id: 't', name: 'Guardachuva', patterns: ['guardachuva', 'feijão', 'guarda chuva com feijão'] }
    return () => void findMentions(tokens, topic)
  })
})
