import { densityStrip, type Band } from './density-strip.js'
import {
  DAILY_ALLOWANCE_MS,
  HOURLY_ALLOWANCE_MS,
  type AdvanceEpisodeOutcome,
  type EpisodeAnalysis,
  type EpisodeFailure,
} from '@overtone/core'
import { renderMessage, type Locale, type MessageCode } from '@overtone/messages'

const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 60 * MS_PER_MINUTE

/** Hours, for the messages that quote the allowance in them. */
const HOURLY_ALLOWANCE_HOURS = HOURLY_ALLOWANCE_MS / MS_PER_HOUR
const DAILY_ALLOWANCE_HOURS = DAILY_ALLOWANCE_MS / MS_PER_HOUR

export interface TermRow {
  readonly term: string
  /** Formatted for the reader's language. */
  readonly count: string
  /** The forms folded onto this term, or empty when there was only one. */
  readonly forms: string
  readonly heuristic: boolean
  readonly heuristicNotice?: string
}

export interface Moment {
  readonly at: string
  readonly quote: string
  /** Kept so a click can seek the audio; the label is for reading. */
  readonly startMs: number
}

export interface TopicRow {
  readonly name: string
  readonly count: string
  /** Unformatted, so a test can prove the count does not move with language. */
  readonly rawCount: number
  readonly moments: readonly Moment[]
  /**
   * Where in the episode it clustered.
   *
   * The count answers "how often" and the quotes answer "doing what".
   * Neither answers *when*, which is the one a group argues about — whether
   * a bit ran all episode or was three minutes near the end.
   */
  readonly strip: readonly Band[]
}

export interface AnalysisView {
  readonly durationLabel: string
  readonly stats: {
    readonly totalWords: string
    readonly countableWords: string
    readonly uniqueTerms: string
    readonly wordsPerMinute: string
    readonly fillersPerMinute: string
  }
  readonly terms: readonly TermRow[]
  readonly topics: readonly TopicRow[]
}

export interface OutcomeView {
  readonly statusLabel: string
  readonly notice?: string
  readonly done: boolean
}

/** What the page knows that the pipeline's outcome does not carry. */
export interface OutcomeContext {
  readonly chunkCount: number
  readonly filename: string
}

/**
 * A position in the audio, as a person reads a clock.
 *
 * Not locale-formatted: `01:05` is a timecode, not a quantity, and both
 * languages write it the same way. The hour only appears once there is one,
 * because `00:01:05` on a two-minute clip is noise.
 */
export function timestamp(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000)
  const seconds = String(total % 60).padStart(2, '0')
  const minutes = total % 3600 / 60
  const hours = Math.floor(total / 3600)

  return hours > 0
    ? `${hours}:${String(Math.floor(minutes)).padStart(2, '0')}:${seconds}`
    : `${String(Math.floor(minutes)).padStart(2, '0')}:${seconds}`
}

const LOCALE_TAGS: Record<Locale, string> = { pt: 'pt-BR', en: 'en-GB' }

/**
 * A number, written the way the reader's language writes it.
 *
 * pt-BR writes `1.234`, English `1,234`. This product's entire output is
 * numbers, so the separator is not a detail — and `toLocaleString` scattered
 * through components is how it ends up inconsistent.
 */
export const number = (value: number, locale: Locale): string =>
  new Intl.NumberFormat(LOCALE_TAGS[locale]).format(value)

/**
 * Turns an episode's analysis into something a page can render.
 *
 * The analysis holds numbers and plain strings; every word around them is
 * produced here (ADR 0017). The counts themselves are untouched — the audio
 * is always pt-BR and switching the interface must never move a number.
 */
export function presentAnalysis(analysis: EpisodeAnalysis, locale: Locale): AnalysisView {
  return {
    durationLabel: timestamp(analysis.durationMs),
    stats: {
      totalWords: number(analysis.totalTokens, locale),
      countableWords: number(analysis.wordTokens, locale),
      uniqueTerms: number(analysis.uniqueTerms, locale),
      wordsPerMinute: number(analysis.wordsPerMinute, locale),
      fillersPerMinute: number(analysis.fillersPerMinute, locale),
    },
    terms: analysis.topTerms.map((term) => ({
      term: term.term,
      count: number(term.count, locale),
      // One form is just the word again, and showing it implies a grouping
      // happened where none did.
      forms: term.surfaceForms.length > 1 ? term.surfaceForms.join(' / ') : '',
      heuristic: term.heuristic,
      ...(term.heuristic
        ? {
            heuristicNotice: renderMessage(locale, 'LEMMA_GROUPED_BY_STEMMER', {
              term: term.term,
            }),
          }
        : {}),
    })),
    topics: analysis.topics.map((topic) => ({
      name: topic.topicName,
      count: number(topic.count, locale),
      rawCount: topic.count,
      moments: topic.mentions.map((mention) => ({
        at: timestamp(mention.startMs),
        quote: mention.matchedText,
        startMs: mention.startMs,
      })),
      strip: densityStrip(topic.mentions, analysis.durationMs),
    })),
  }
}

/** The message code and data for a failure the pipeline reported. */
function noticeForFailure(
  failure: EpisodeFailure,
  locale: Locale,
  context: OutcomeContext,
): string {
  switch (failure.code) {
    case 'AUDIO_UNREADABLE':
      return renderMessage(locale, 'UNREADABLE_AUDIO', { filename: context.filename })
    // The provider could not fetch what we uploaded, which means the audio is
    // no longer where we put it.
    case 'AUDIO_NOT_FOUND':
      return renderMessage(locale, 'UPLOAD_INTERRUPTED', {})
    case 'PROVIDER_UNAVAILABLE':
      return renderMessage(locale, 'TRANSCRIPTION_SERVICE_UNAVAILABLE', {
        chunk_index: 1,
        attempts: 1,
      })
    case 'PROVIDER_RESPONSE_INVALID':
      return renderMessage(locale, 'CHUNK_FAILED', {
        chunk_index: 1,
        chunk_count: context.chunkCount,
        succeeded_count: 0,
      })
    case 'ALLOWANCE_EXHAUSTED':
      return renderMessage(locale, 'HOURLY_ALLOWANCE_EXHAUSTED', {
        allowance_hours: HOURLY_ALLOWANCE_HOURS,
        minutes_until_reset: Math.ceil(failure.retryAfterMs / MS_PER_MINUTE),
      })
    case 'ANALYSIS_NOT_STORED':
      return renderMessage(locale, 'ANALYSIS_NOT_SAVED', {})
  }
}

const STATUS: Record<'transcribing' | 'ready' | 'failed', MessageCode> = {
  transcribing: 'STATUS_TRANSCRIBING',
  ready: 'STATUS_READY',
  failed: 'STATUS_FAILED',
}

/**
 * Says where an episode has got to, in the reader's language.
 *
 * Waiting on the allowance is reported as *transcribing*, because that is
 * what it is: a normal state of a paced pipeline (ADR 0020), not a fault. The
 * reason for the pause belongs in the notice, not in the status.
 */
export function presentOutcome(
  outcome: AdvanceEpisodeOutcome,
  locale: Locale,
  context: Partial<OutcomeContext> = {},
): OutcomeView {
  const filled: OutcomeContext = {
    chunkCount: context.chunkCount ?? 1,
    filename: context.filename ?? '',
  }

  switch (outcome.state) {
    case 'ready':
      return { statusLabel: renderMessage(locale, STATUS.ready, {}), done: true }

    case 'failed':
      return {
        statusLabel: renderMessage(locale, STATUS.failed, {}),
        notice: noticeForFailure(outcome.failure, locale, filled),
        done: true,
      }

    case 'transcribed': {
      const done = outcome.chunkIndex + 1
      return {
        statusLabel: renderMessage(locale, STATUS.transcribing, {}),
        notice: renderMessage(locale, 'CHUNK_PROGRESS', {
          done,
          total: done + outcome.remaining,
        }),
        done: false,
      }
    }

    case 'waiting':
      return {
        statusLabel: renderMessage(locale, STATUS.transcribing, {}),
        notice:
          outcome.reason === 'DAILY_ALLOWANCE_EXHAUSTED'
            ? renderMessage(locale, 'DAILY_ALLOWANCE_EXHAUSTED', {
                allowance_hours: DAILY_ALLOWANCE_HOURS,
                // A wall-clock time is not useful to someone reading a page;
                // the hours are. It is carried because the catalogue declares
                // it and a share link may be read in another zone.
                reset_at_utc: '',
                hours_until_reset: Math.ceil(outcome.retryAfterMs / MS_PER_HOUR),
              })
            : renderMessage(locale, 'HOURLY_ALLOWANCE_EXHAUSTED', {
                allowance_hours: HOURLY_ALLOWANCE_HOURS,
                minutes_until_reset: Math.ceil(outcome.retryAfterMs / MS_PER_MINUTE),
              }),
        done: false,
      }
  }
}
