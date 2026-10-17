import type { TimedWord } from '../domain/timed-word.js'

/**
 * Transcribed speech sometimes runs for minutes without a full stop. A cap
 * keeps the reader usable when punctuation never arrives.
 */
export const DEFAULT_MAX_WORDS = 40

const SENTENCE_END = /[.!?…]["')\]]?$/u
const HAS_LETTER = /\p{L}/u

/**
 * A full stop only ends a sentence if there was a sentence.
 *
 * Transcribers emit bare punctuation — a lone `...` for a pause — and
 * treating that as a sentence boundary cuts a thought in half and leaves a
 * segment trailing off into nothing.
 */
const endsASentence = (text: string): boolean =>
  HAS_LETTER.test(text) && SENTENCE_END.test(text)

/**
 * How far a boundary may sit from a word's start and still be its boundary.
 *
 * The transcriber's segment starts and its word starts are produced by
 * different passes and disagree slightly — measured on a real episode, by
 * twenty to a few hundred milliseconds. Matching exactly would drop most
 * boundaries; matching loosely would attach one boundary to two different
 * gaps, which is worse.
 */
const BOUNDARY_TOLERANCE_MS = 300

/**
 * A line this short, mid-sentence, is a tail rather than a turn.
 *
 * The transcriber puts a boundary before a trailing `né?` as readily as
 * before a new speaker. Honouring that one splits a single spoken line in
 * two, which reads worse than the running-together it is meant to fix — so
 * a very short line that continues an unfinished sentence goes back where
 * it came from. A short line *after* a full stop is left alone: that is a
 * real turn, and those are the ones that were being lost.
 */
const SHORT_TAIL_WORDS = 2

/** A run of words that belong on one line, and the span it covers. */
export interface WordGroup {
  readonly startMs: number
  readonly endMs: number
  readonly words: readonly TimedWord[]
}

/**
 * Cuts a transcript into lines at the places a reader expects a break.
 *
 * The one rule for where the transcript breaks. Two things need it and they
 * must agree: the stored segments a quote links to, and the live reader,
 * which has only raw chunk words because segments are not written until the
 * last chunk lands. Two implementations of "where does a line start" would
 * mean a search result pointing at a line the reader never drew.
 *
 * Breaks at three things, in the order they matter: a boundary the
 * transcriber itself drew, a full stop, and a word cap for the stretches
 * where neither arrives. The transcriber's boundaries are the only one of
 * the three that knows a *different person* started talking — reported from
 * a real episode, three turns ran onto one line because no full stop was
 * written between them.
 *
 * Every word comes back in exactly one group — the page shows the whole
 * transcript, so dropping one here would lose it from the screen.
 */
export function groupWords(
  words: readonly TimedWord[],
  maxWords: number = DEFAULT_MAX_WORDS,
  boundariesMs: readonly number[] = [],
): WordGroup[] {
  const groups: WordGroup[] = []
  let current: TimedWord[] = []

  /*
   * Which words begin a line because the transcriber said so.
   *
   * Each boundary is attached to the first word that reaches it, rather than
   * compared against the previous word's end — the timings overlap when two
   * people talk over each other, so the end of the last word is routinely
   * *after* the start of the next one and says nothing about where the break
   * belongs. A boundary before the first word, or past the last, has no gap
   * to fall in and is ignored.
   */
  const startsALine = new Set<number>()
  /*
   * One pass over the words for all of the boundaries, rather than a
   * `findIndex` per boundary — that was **O(boundaries × words)**, and a
   * two-hour episode has about 1 400 transcriber segments against 20 000
   * words. Measured at 96 ms for one episode and rising fourfold with every
   * doubling; this is linear and runs in single digits.
   *
   * It computes the same thing. `findIndex` returns the *first* ascending
   * index satisfying the predicate, and so does walking the words upward and
   * claiming each boundary the moment one reaches it.
   *
   * Sorted first because the single pass consumes boundaries in order, while
   * `findIndex` did not care. Sorting a copy keeps that difference from
   * mattering — the result is a set of indices, so the order they were
   * discovered in is not part of the answer. **Word** start times are *not*
   * assumed sorted, and must not be: 4.5 % of them run backwards in a real
   * episode, by as much as 420 ms, because people talk over each other.
   */
  const inOrder = [...boundariesMs].sort((one, other) => one - other)
  let boundary = 0
  for (const [at, word] of words.entries()) {
    while (
      boundary < inOrder.length &&
      /* c8 ignore next -- unreachable: the line above checks `boundary` is
         inside `inOrder`, so the read is always a number. */
      (inOrder[boundary] ?? 0) - BOUNDARY_TOLERANCE_MS <= word.startMs
    ) {
      if (at > 0) startsALine.add(at)
      boundary += 1
    }
  }

  const flush = (): void => {
    const first = current[0]
    const last = current.at(-1)
    if (first === undefined || last === undefined) return

    groups.push({ startMs: first.startMs, endMs: last.endMs, words: current })
    current = []
  }

  words.forEach((word, at) => {
    if (startsALine.has(at)) flush()

    current.push(word)
    if (endsASentence(word.text) || current.length >= maxWords) flush()
  })

  flush()
  return joinStrandedTails(groups, maxWords)
}

/** Puts a short mid-sentence line back on the end of the one it came from. */
function joinStrandedTails(groups: readonly WordGroup[], maxWords: number): WordGroup[] {
  const joined: WordGroup[] = []

  for (const group of groups) {
    const previous = joined.at(-1)
    const continuesASentence =
      /* c8 ignore next -- unreachable: `flush` refuses to push an empty
         group and a join concatenates two non-empty ones, so a group always
         has a last word. */
      previous !== undefined && !endsASentence(previous.words.at(-1)?.text ?? '')

    if (
      previous !== undefined &&
      continuesASentence &&
      group.words.length <= SHORT_TAIL_WORDS &&
      previous.words.length + group.words.length <= maxWords
    ) {
      joined[joined.length - 1] = {
        startMs: previous.startMs,
        endMs: group.endMs,
        words: [...previous.words, ...group.words],
      }
      continue
    }

    joined.push(group)
  }

  return joined
}
