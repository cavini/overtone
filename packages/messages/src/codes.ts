/**
 * Every message the product can show, and the data each one needs.
 *
 * This is the contract between the inside of the app and the words a reader
 * sees. Nothing below the presenter holds a sentence: a use case returns
 * `EPISODE_TOO_LONG` with its numbers, and the presenter turns that into
 * Portuguese or English. Two things follow — the same failure can be read in
 * either language, and a test can assert the failure without asserting prose
 * that a copy edit would break.
 *
 * Declared once, as runtime data, with the types derived from it. A type
 * alone cannot be iterated, so the catalogue-parity test would have had
 * nothing to check against; a second hand-written list would have drifted
 * from the first.
 */

/**
 * `strings` is a list the presenter joins with `Intl.ListFormat` before
 * interpolating, so `mp3, m4a e wav` reads correctly in Portuguese and
 * `mp3, m4a and wav` in English.
 */
type ParamKind = 'string' | 'number' | 'strings'

type Resolve<K extends ParamKind> = K extends 'string'
  ? string
  : K extends 'number'
    ? number
    : readonly string[]

export const MESSAGE_PARAMS = {
  // Input, upload and format
  UNSUPPORTED_FORMAT: { extension: 'string', accepted: 'strings' },
  UNREADABLE_AUDIO: { filename: 'string' },
  EPISODE_TOO_LONG: {
    duration_minutes: 'number',
    max_minutes: 'number',
    allowance_hours_today: 'number',
  },
  UPLOAD_COST_PREVIEW: {
    duration_ms: 'number',
    daily_allowance_hours: 'number',
    share_of_daily: 'number',
  },
  UPLOAD_INTERRUPTED: {},

  // Pipeline, progress and failure
  CHUNK_PROGRESS: { done: 'number', total: 'number' },
  CHUNK_FAILED: {
    chunk_index: 'number',
    chunk_count: 'number',
    succeeded_count: 'number',
  },
  CHUNK_TIMEOUT: { chunk_index: 'number', timeout_seconds: 'number' },
  TRANSCRIPTION_SERVICE_UNAVAILABLE: { chunk_index: 'number', attempts: 'number' },
  AUDIO_IS_SAFE: {},
  NO_SPEECH_DETECTED: {},
  ANALYSIS_NOT_SAVED: {},
  LEMMA_GROUPED_BY_STEMMER: { term: 'string' },

  // Allowance and storage
  ALLOWANCE_REMAINING: {
    remaining_ms: 'number',
    allowance_hours: 'number',
    whole_episodes_remaining: 'number',
  },
  HOURLY_ALLOWANCE_EXHAUSTED: {
    allowance_hours: 'number',
    minutes_until_reset: 'number',
  },
  DAILY_ALLOWANCE_EXHAUSTED: {
    allowance_hours: 'number',
    reset_at_utc: 'string',
    hours_until_reset: 'number',
  },
  SEARCH_SHOWING_A_SAMPLE: { match_count: 'number' },
  SEARCH_FOUND_EVERY_ONE: { match_count: 'number' },
  PASSWORD_TOO_SHORT: { min_chars: 'number' },
  PASSWORD_NEEDS_CONTENT: {},
  STORAGE_FULL: {
    used_bytes: 'number',
    limit_bytes: 'number',
    needed_bytes: 'number',
  },

  // Topics and terms
  TOPIC_NAME_TAKEN: { name: 'string' },
  TOPIC_NEEDS_A_NAME: {},
  TOPIC_NEEDS_A_TERM: {},
  TERM_TOO_MANY_WORDS: { word_count: 'number', max_words: 'number' },
  TOPIC_TERM_LIMIT: { max_terms: 'number' },
  LIBRARY_TOPIC_LIMIT: { max_topics: 'number' },
  ALIAS_SUGGESTED_WRITTEN_VARIANT: { term: 'string', alias: 'string' },
  TOPIC_APPLY_SKIPPED_NO_TRANSCRIPT: {
    episode_number: 'number',
    status: 'string',
  },

  // Series and episodes
  EPISODE_NUMBER_TAKEN: { number: 'number' },
  EPISODE_TITLE_REQUIRED: {},
  EPISODES_STILL_PROCESSING: { processing_count: 'number' },
  DELETE_EPISODE_CONFIRMATION: { title: 'string' },

  // Empty and first-episode states. Load-bearing, because the series starts
  // at episode one and nothing is imported.
  LIBRARY_EMPTY: { accepted: 'strings', max_minutes: 'number' },
  NO_TOPICS_YET: { suggested_term: 'string' },
  TOPIC_NO_EPISODES_YET: {},
  SERIES_FIRST_EPISODE: {},
  SERIES_NEEDS_SECOND_EPISODE: {},
  TREND_NEEDS_MORE_EPISODES: { episode_count: 'number', minimum: 'number' },

  // Honesty, warnings and disclosure
  COUNTS_DESCRIBE_PUBLISHED_EDIT: {},
  ANALYSIS_ALWAYS_PTBR: {},
  TRANSCRIPT_QUALITY_POOR: { quality_score: 'number', threshold: 'number' },
  AUDIO_MAY_NOT_BE_PTBR: {
    quality_score: 'number',
    detected_language: 'string',
  },

  // Status labels. The stored value is the contract; this is only its label.
  STATUS_UPLOADED: {},
  STATUS_TRANSCRIBING: {},
  STATUS_ANALYZING: {},
  STATUS_READY: {},
  STATUS_FAILED: {},
  STATUS_DELETING: {},
} as const satisfies Record<string, Readonly<Record<string, ParamKind>>>

export type MessageCode = keyof typeof MESSAGE_PARAMS

/** The data each message needs, derived from the declaration above. */
export type MessageParams = {
  [Code in MessageCode]: {
    readonly [Param in keyof (typeof MESSAGE_PARAMS)[Code]]: Resolve<
      (typeof MESSAGE_PARAMS)[Code][Param] extends ParamKind
        ? (typeof MESSAGE_PARAMS)[Code][Param]
        : never
    >
  }
}

export const MESSAGE_CODES = Object.keys(MESSAGE_PARAMS) as readonly MessageCode[]

/** The locales the interface is offered in. Analysis is always pt-BR. */
export const LOCALES = ['pt', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'pt'
