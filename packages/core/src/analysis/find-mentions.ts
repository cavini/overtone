import type { AnnotatedToken } from '../domain/token.js'
import type { Mention } from '../domain/mention.js'
import type { Topic } from '../domain/topic.js'
import { normalize } from './normalize.js'

/**
 * Dropped from the front of a pattern, so writing `o hotdog` matches `hotdog`.
 * Only ever stripped from a pattern, never from the transcript.
 */
const LEADING_DETERMINERS: ReadonlySet<string> = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
])

const SEPARATORS = /[\s\-'’]/gu

/**
 * Collapses a run of words to a comparison key.
 *
 * Removing separators is what makes `hotdog`, `hot dog` and `hot-dog` the
 * same thing without listing each spelling: all three reduce to `hotdog`,
 * whether they arrived as one token or three.
 */
function keyOf(words: readonly string[]): string {
  return words.join('').replace(SEPARATORS, '')
}

/**
 * Drops articles from the front of a pattern, so `o hotdog` matches `hotdog`.
 *
 * A pattern made entirely of determiners is left alone: someone tracking how
 * often they say `o a` is doing something odd, but they meant it.
 */
function stripLeadingDeterminers(words: readonly string[]): readonly string[] {
  const firstMeaningful = words.findIndex((word) => !LEADING_DETERMINERS.has(word))
  return firstMeaningful > 0 ? words.slice(firstMeaningful) : words
}

/**
 * The key a pattern is looked up by.
 *
 * Exported because it has to be computed in two places — once when a running
 * joke is saved, once when an episode is scanned — and the two must agree
 * exactly or the joke silently counts zero. They did not: storage was
 * stripping spaces and hyphens off the raw text, so "o pirão" was filed
 * under `opirão` while the scanner looked for `pirão`.
 */
export function matchKeyFor(pattern: string): string | undefined {
  return compilePattern(pattern)
}

/*
 * Split on whitespace rather than tokenised, deliberately.
 *
 * `match_key` is stored on the topic and compared against a key computed
 * while scanning an episode, so the two must agree exactly or a running joke
 * silently counts zero. Tokenising would make the key depend on the language
 * the splitter was given — and a series can now hold episodes in both — while
 * `keyOf` strips the hyphens and apostrophes a splitter would have cut on
 * anyway. `diga-me` keys as `digame` either way; the difference is that this
 * way it cannot drift.
 */
function compilePattern(pattern: string): string | undefined {
  const words = normalize(pattern).split(' ').filter((word) => word.length > 0)
  const key = keyOf(stripLeadingDeterminers(words))

  return key.length > 0 ? key : undefined
}

function isPrefixOfAny(candidate: string, keys: ReadonlySet<string>): boolean {
  for (const key of keys) {
    if (key.startsWith(candidate)) return true
  }
  return false
}

/**
 * Finds every occurrence of a topic in a token stream.
 *
 * Matching is exact adjacency — no words allowed in between — because a
 * tolerance window needs tuning and an evaluation set to be anything but a
 * guess, and a loose match inflates a count invisibly.
 *
 * It deliberately ignores sentence boundaries. Transcribed punctuation is
 * unreliable enough that respecting it would cause more missed mentions than
 * the false matches it prevents, so `comprei o hot. Dog comeu` counts. That
 * is a known, documented, rare cost.
 *
 * Each token belongs to at most one mention, and the longest pattern wins, so
 * `pão com salsicha` is one mention rather than also counting as `pão`.
 */
export function findMentions(
  tokens: readonly AnnotatedToken[],
  topic: Topic,
): Mention[] {
  const keys = new Set(
    topic.patterns
      .map(compilePattern)
      .filter((key): key is string => key !== undefined),
  )

  if (keys.size === 0) return []

  const longestKey = Math.max(...[...keys].map((key) => key.length))
  const mentions: Mention[] = []

  let start = 0

  while (start < tokens.length) {
    let surfaceKey = ''
    let lemmaKey = ''
    const spellings: string[] = []
    let match: { endIndex: number; text: string } | undefined

    for (let end = start; end < tokens.length; end += 1) {
      const token = tokens[end]
      /* c8 ignore next -- unreachable: `end` is bounded by `tokens.length`.
         The check exists only because `noUncheckedIndexedAccess` cannot see
         that, and removing it would mean either a non-null assertion or
         slicing the array at every position. */
      if (token === undefined) break

      spellings.push(token.surface)
      surfaceKey += token.surface.replace(SEPARATORS, '')
      lemmaKey += token.lemma.replace(SEPARATORS, '')

      if (surfaceKey.length > longestKey && lemmaKey.length > longestKey) break

      if (keys.has(surfaceKey) || keys.has(lemmaKey)) {
        match = { endIndex: end, text: spellings.join(' ') }
      }

      // Keep growing only while some pattern could still be completed. An
      // exact match is a prefix of itself, so a longer pattern still wins.
      if (!isPrefixOfAny(surfaceKey, keys) && !isPrefixOfAny(lemmaKey, keys)) break
    }

    if (match === undefined) {
      start += 1
      continue
    }

    mentions.push({
      topicId: topic.id,
      matchedText: match.text,
      startIndex: start,
      endIndex: match.endIndex,
    })
    start = match.endIndex + 1
  }

  return mentions
}
