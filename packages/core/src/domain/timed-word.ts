/**
 * A word as the transcriber heard it, with where it sits in the audio.
 *
 * Word-level timing was a hard requirement on the transcription service for
 * one reason: it is what lets a count link back to the moment that produced
 * it. A number you cannot hear for yourself is a number you cannot check.
 */
export interface TimedWord {
  readonly text: string
  readonly startMs: number
  readonly endMs: number
}
