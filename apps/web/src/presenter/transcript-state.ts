/**
 * Which read of which episode a set of lines belongs to.
 *
 * The episode alone is not enough. A correction re-derives the whole episode
 * from the corrected words (US-049), so the lines in hand afterwards describe
 * an analysis that no longer exists — same episode, different answer. `read`
 * is bumped each time the reader is sent back to the first chunk.
 */
export interface TranscriptRead {
  readonly episodeId: string
  readonly read: number
}

/** What the transcript area has to show. */
export type TranscriptState = 'loading' | 'empty' | 'lines'

/**
 * Which of three different things is true about the transcript area.
 *
 * The page used to know two: there are lines, or there are not. So the gap
 * between clicking an episode and its words arriving — a second normally,
 * and as long as the connection is slow — was spent saying "nothing
 * transcribed yet" about episodes holding two hours of it.
 *
 * Not fetched yet and fetched with nothing in it are different answers, and
 * they are told apart by *whose* lines are in hand rather than by how many
 * there are. That is what makes the switch from one episode to the next
 * safe: until this episode's own answer has come back there is nothing
 * truthful to say about it, whatever the previous one left on screen.
 */
export function transcriptState({
  asked,
  inHand,
  chars,
}: {
  /** The episode on screen, and which read of it. */
  readonly asked: TranscriptRead
  /** What the lines in hand came back for, or nothing before the first answer. */
  readonly inHand: TranscriptRead | undefined
  /**
   * How much text is in hand, from `totalChars`.
   *
   * Characters rather than lines, because a stretch of music transcribes to
   * lines with no words in them — which is empty, and is drawn as empty.
   */
  readonly chars: number
}): TranscriptState {
  if (inHand?.episodeId !== asked.episodeId || inHand.read !== asked.read) return 'loading'

  return chars === 0 ? 'empty' : 'lines'
}
