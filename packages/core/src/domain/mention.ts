/**
 * One occurrence of a topic, located precisely enough to play back.
 *
 * Indices are positions in the episode's token stream. They are what lets a
 * count drill down to the audio: a number nobody can hear for themselves is
 * a number nobody argues with, and arguing with it is the whole point.
 */
export interface Mention {
  readonly topicId: string
  readonly matchedText: string
  readonly startIndex: number
  readonly endIndex: number
}
