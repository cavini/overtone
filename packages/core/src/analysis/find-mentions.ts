import type { AnnotatedToken } from '../domain/token.js'
import type { Mention } from '../domain/mention.js'
import type { Topic } from '../domain/topic.js'
import { normalize } from './normalize.js'
import { tokenise } from './tokenise.js'

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

function compilePattern(pattern: string): string | undefined {
  let words = tokenise(normalize(pattern)).map((token) => token.surface)

  while (words.length > 1 && LEADING_DETERMINERS.has(words[0] ?? '')) {
    words = words.slice(1)
  }

  const key = keyOf(words)
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
