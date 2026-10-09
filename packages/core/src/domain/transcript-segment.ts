import type { TokenClass } from './token.js'

/**
 * One analysed word, kept with its segment.
 *
 * This is the record a drill-down reads: the spelling that was said, the term
 * it counted towards, and when — which is what turns a number into something
 * a listener can check for themselves.
 */
export interface SegmentWord {
  readonly surface: string
  readonly lemma: string
  readonly startMs: number
  readonly endMs: number
  readonly tokenClass: TokenClass
}

/**
 * A readable, seekable slice of a transcript.
 *
 * `text` is what was said, spelling and punctuation intact, because that is
 * what a reader reads and what a shared quote shows. `words` is the analysed
 * form underneath it, which is what the counting used.
 */
export interface TranscriptSegment {
  readonly position: number
  readonly startMs: number
  readonly endMs: number
  readonly text: string
  readonly words: readonly SegmentWord[]
}
