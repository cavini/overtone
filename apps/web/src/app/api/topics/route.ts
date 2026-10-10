import type { TopicProblem } from '@overtone/core'
import {
  DEFAULT_LOCALE,
  LOCALES,
  renderMessage,
  type Locale,
  type MessageParams,
} from '@overtone/messages'
import { createTopic, deleteTopic, listTopics } from '../../../server/topics.js'

export const runtime = 'nodejs'

const localeOf = (value: unknown): Locale =>
  LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE

/**
 * Turns a rejected running joke into words.
 *
 * The domain reports a code and its numbers; the sentence is assembled here,
 * which is the only place that knows what language anyone is reading
 * (ADR 0017). Exhaustive by type, so a new kind of problem cannot be added
 * without deciding what it says.
 */
function explain(problem: TopicProblem, locale: Locale): string {
  switch (problem.code) {
    case 'TOPIC_NEEDS_A_NAME':
      return renderMessage(locale, 'TOPIC_NEEDS_A_NAME', {})
    case 'TOPIC_NEEDS_A_TERM':
      return renderMessage(locale, 'TOPIC_NEEDS_A_TERM', {})
    case 'TOPIC_NAME_TAKEN':
      return renderMessage(locale, 'TOPIC_NAME_TAKEN', { name: problem.name })
    case 'TERM_TOO_MANY_WORDS':
      return renderMessage(locale, 'TERM_TOO_MANY_WORDS', {
        word_count: problem.wordCount,
        max_words: problem.maxWords,
      } satisfies MessageParams['TERM_TOO_MANY_WORDS'])
    case 'TOPIC_TERM_LIMIT':
      return renderMessage(locale, 'TOPIC_TERM_LIMIT', { max_terms: problem.maxTerms })
    case 'LIBRARY_TOPIC_LIMIT':
      return renderMessage(locale, 'LIBRARY_TOPIC_LIMIT', { max_topics: problem.maxTopics })
  }
}

export async function GET(): Promise<Response> {
  return Response.json({ topics: await listTopics() })
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    patterns?: string[]
    locale?: string
  }
  const locale = localeOf(body.locale)

  const result = await createTopic({
    name: String(body.name ?? ''),
    patterns: Array.isArray(body.patterns) ? body.patterns.map(String) : [],
  })

  if ('problem' in result) {
    return Response.json({ error: explain(result.problem, locale) }, { status: 400 })
  }

  return Response.json({ topic: result.topic })
}

export async function DELETE(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (id.length === 0) return Response.json({ error: 'UNEXPECTED' }, { status: 400 })

  await deleteTopic(id)
  return Response.json({ ok: true })
}
