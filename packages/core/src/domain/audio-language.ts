/**
 * The language an episode is spoken in.
 *
 * This used to be a constant. ADR 0014 fixed it at Brazilian Portuguese and
 * the interface language was explicitly *not* allowed to influence it — the
 * worry being that someone reading in English would see different numbers
 * for the same audio, which would make every count untrustworthy.
 *
 * That worry was right about one thing and wrong about another. It is still
 * true that a finished episode's counts must never move because somebody
 * switched languages. It was wrong to conclude the language could never be
 * chosen at all: the group records in Portuguese today, and a different
 * recording in English is a different episode, not a re-reading of the same
 * one. See ADR 0022.
 *
 * So: chosen per episode, fixed once that episode is transcribed.
 */
export const AUDIO_LANGUAGES = ['pt', 'en'] as const

export type AudioLanguage = (typeof AUDIO_LANGUAGES)[number]

export const DEFAULT_AUDIO_LANGUAGE: AudioLanguage = 'pt'

/** Narrows anything to a language the transcriber is actually told about. */
export function asAudioLanguage(value: unknown): AudioLanguage {
  return AUDIO_LANGUAGES.includes(value as AudioLanguage)
    ? (value as AudioLanguage)
    : DEFAULT_AUDIO_LANGUAGE
}
