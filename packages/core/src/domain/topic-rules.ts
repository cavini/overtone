/**
 * What a running joke is allowed to be.
 *
 * The limits are not arbitrary and they are not about storage. Every topic
 * is scanned across every token of a two-hour episode, so the cost of the
 * matching pass is topics × terms × tokens — and the only person who pays
 * for an unbounded list is the one waiting for their counts.
 */

/**
 * Spellings per joke.
 *
 * Has to be generous: the transcriber's variants are the point. Experiment
 * 0001 found `hotdog` consistently heard as "Outdog", and the same joke
 * counted zero without the alias and twice with it. A joke needs room for
 * how it is said *and* for how it comes out.
 */
export const MAX_TERMS_PER_TOPIC = 12

/** Jokes per series. A show has recurring bits, not a hundred of them. */
export const MAX_TOPICS_PER_SERIES = 25

/**
 * Words in one phrase.
 *
 * Longer than this is a sentence rather than a joke, and it would mostly
 * fail to match anyway — the transcriber's word boundaries and punctuation
 * drift over a long span.
 */
export const MAX_WORDS_PER_TERM = 5

/** Enough of a topic to check, before it has an id. */
export interface TopicDraft {
  readonly name: string
  readonly patterns: readonly string[]
}

/**
 * Why a running joke was not accepted.
 *
 * A code and its data, never a sentence: nothing down here knows which
 * language the reader wants (ADR 0017).
 */
export type TopicProblem =
  | { readonly code: 'TOPIC_NEEDS_A_NAME' }
  | { readonly code: 'TOPIC_NEEDS_A_TERM' }
  | { readonly code: 'TOPIC_NAME_TAKEN'; readonly name: string }
  | { readonly code: 'TERM_TOO_MANY_WORDS'; readonly wordCount: number; readonly maxWords: number }
  | { readonly code: 'TOPIC_TERM_LIMIT'; readonly maxTerms: number }
  | { readonly code: 'LIBRARY_TOPIC_LIMIT'; readonly maxTopics: number }

/** Names are for people to read, so they are compared the way people read. */
const sameName = (a: string, b: string): boolean =>
  a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR')

const meaningful = (patterns: readonly string[]): readonly string[] =>
  patterns.map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0)

/**
 * Checks a joke before it is saved, or `undefined` if it is fine.
 *
 * `editing` names the joke being replaced, so renaming one does not collide
 * with itself and editing one does not count against a full library.
 */
export function checkTopic(
  draft: TopicDraft,
  existing: readonly TopicDraft[],
  editing?: string,
): TopicProblem | undefined {
  const others = existing.filter((topic) => editing === undefined || !sameName(topic.name, editing))

  // Reported first: being full is a different kind of answer from getting a
  // field wrong, because nothing they change about this joke will help.
  if (others.length >= MAX_TOPICS_PER_SERIES) {
    return { code: 'LIBRARY_TOPIC_LIMIT', maxTopics: MAX_TOPICS_PER_SERIES }
  }

  if (draft.name.trim().length === 0) return { code: 'TOPIC_NEEDS_A_NAME' }

  if (others.some((topic) => sameName(topic.name, draft.name))) {
    return { code: 'TOPIC_NAME_TAKEN', name: draft.name.trim() }
  }

  const patterns = meaningful(draft.patterns)
  if (patterns.length === 0) return { code: 'TOPIC_NEEDS_A_TERM' }

  if (patterns.length > MAX_TERMS_PER_TOPIC) {
    return { code: 'TOPIC_TERM_LIMIT', maxTerms: MAX_TERMS_PER_TOPIC }
  }

  for (const pattern of patterns) {
    const wordCount = pattern.split(/\s+/u).length
    if (wordCount > MAX_WORDS_PER_TERM) {
      return { code: 'TERM_TOO_MANY_WORDS', wordCount, maxWords: MAX_WORDS_PER_TERM }
    }
  }

  return undefined
}
