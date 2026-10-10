import {
  checkTopic,
  matchKeyFor,
  type Topic,
  type TopicDraft,
  type TopicProblem,
} from '@overtone/core'
import { topics, topicTerms } from '@overtone/db/schema'
import { asc, eq } from 'drizzle-orm'
import { sharedSeriesId } from './analyse-upload.js'
import { database } from './wiring.js'

/**
 * The running jokes, which are the reason this product exists.
 *
 * A topic is a name and a list of spellings, because the transcriber decides
 * how a word comes out and it does not always agree with how it is said.
 * Experiment 0001 found `hotdog` consistently heard as "Outdog": the same
 * joke counted zero without that alias and twice with it (ADR 0006).
 */

export interface StoredTopic extends Topic {
  readonly termCount: number
}

export async function listTopics(): Promise<StoredTopic[]> {
  const db = database()
  const seriesId = await sharedSeriesId()

  const rows = await db
    .select({ id: topics.id, name: topics.name, pattern: topicTerms.pattern })
    .from(topics)
    .leftJoin(topicTerms, eq(topicTerms.topicId, topics.id))
    .where(eq(topics.seriesId, seriesId))
    .orderBy(asc(topics.name), asc(topicTerms.pattern))

  // A left join so a joke with no spellings still comes back — it is an
  // invalid state, but hiding it would make it impossible to delete.
  const byId = new Map<string, { readonly name: string; readonly patterns: string[] }>()
  for (const row of rows) {
    const entry = byId.get(row.id) ?? { name: row.name, patterns: [] as string[] }
    if (row.pattern !== null && row.pattern !== undefined) entry.patterns.push(row.pattern)
    byId.set(row.id, entry)
  }

  return [...byId].map(([id, { name, patterns }]) => ({
    id,
    name,
    patterns,
    termCount: patterns.length,
  }))
}

/**
 * Saves a running joke, or says why it cannot be saved.
 *
 * A problem comes back as a code rather than a thrown error: being told "you
 * already have one called that" is an ordinary answer to an ordinary
 * request, not an exception.
 */
export async function createTopic(
  draft: TopicDraft,
): Promise<{ topic: StoredTopic } | { problem: TopicProblem }> {
  const existing = await listTopics()
  const problem = checkTopic(draft, existing)
  if (problem !== undefined) return { problem }

  const patterns = draft.patterns.map((pattern) => pattern.trim()).filter((p) => p.length > 0)

  // Keyed with the same function the scanner uses. Computing it separately
  // here is how "o pirão" ends up filed under a key nothing looks for.
  const terms = patterns
    .map((pattern) => ({ pattern, matchKey: matchKeyFor(pattern) }))
    .filter((term): term is { pattern: string; matchKey: string } => term.matchKey !== undefined)

  if (terms.length === 0) return { problem: { code: 'TOPIC_NEEDS_A_TERM' } }

  const db = database()
  const [created] = await db
    .insert(topics)
    .values({ seriesId: await sharedSeriesId(), name: draft.name.trim() })
    .returning({ id: topics.id })

  const id = created?.id ?? ''
  await db.insert(topicTerms).values(terms.map((term) => ({ topicId: id, ...term })))

  return {
    topic: {
      id,
      name: draft.name.trim(),
      patterns: terms.map((term) => term.pattern),
      termCount: terms.length,
    },
  }
}

export async function deleteTopic(id: string): Promise<void> {
  // The terms go with it: `topic_terms` cascades on the foreign key, and so
  // do any mentions already counted against it.
  await database().delete(topics).where(eq(topics.id, id))
}
