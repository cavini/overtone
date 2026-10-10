import type { ChunkTranscript } from '../domain/audio-chunk.js'

/**
 * How much of the previous chunk to carry forward.
 *
 * The provider caps the prompt — Whisper reads 224 tokens of it and drops
 * the rest — and the useful part is the end: the sentence this chunk is
 * carrying on from, not what was being said twelve minutes ago. Two hundred
 * characters sits comfortably inside the cap in Portuguese.
 */
export const PROMPT_TAIL_CHARS = 200

/**
 * What the chunk before this one ended up saying.
 *
 * An episode is longer than the hourly allowance, so it is cut up and each
 * piece is transcribed on its own (ADR 0020) — which leaves every piece but
 * the first beginning mid-conversation with no idea what it is continuing.
 * Measured on a real episode: the same chunk transcribed cold lost a whole
 * clause that the prompted run recovered, and its punctuation and casing
 * restarted from nothing at the join.
 *
 * Nothing at all rather than an empty string when there is no previous
 * chunk, because a blank prompt is still a prompt — it tells the model the
 * thing it is continuing had no words in it.
 */
export function precedingTail(
  chunks: readonly ChunkTranscript[],
  index: number,
): string | undefined {
  const before = chunks.find((chunk) => chunk.index === index - 1)
  if (before === undefined || before.words.length === 0) return undefined

  const said = before.words.map((word) => word.text).join(' ')
  if (said.length <= PROMPT_TAIL_CHARS) return said

  // Cut on a space, so the model is not handed half a word to continue from.
  const tail = said.slice(said.length - PROMPT_TAIL_CHARS)
  const space = tail.indexOf(' ')

  return space === -1 ? tail : tail.slice(space + 1)
}
