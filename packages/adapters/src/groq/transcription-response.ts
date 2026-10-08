import { z } from 'zod'

/**
 * The shape of a `verbose_json` transcription response.
 *
 * Validated rather than trusted. The published documentation describes the
 * segment fields but does not pin down the word array, and a provider that
 * quietly stopped returning word timings would otherwise produce a transcript
 * that counts perfectly and cannot be played back — a silent loss of the one
 * feature that makes a count checkable. Parsing strictly turns that into a
 * loud failure instead.
 */
export const groqTranscriptionResponse = z.object({
  text: z.string(),
  // Seconds, as a float. Absent when only segment granularity was requested,
  // which for us is a failure rather than a degraded success.
  words: z
    .array(
      z.object({
        word: z.string(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .min(1),
  duration: z.number().optional(),
  language: z.string().optional(),
})

export type GroqTranscriptionResponse = z.infer<typeof groqTranscriptionResponse>
