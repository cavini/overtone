import { searchTranscripts } from '@overtone/core'
import { DrizzleTranscriptSearch } from '@overtone/db/repositories'
import { database } from '../../../server/wiring.js'

export const runtime = 'nodejs'

/**
 * Finds where something was said.
 *
 * Costs nothing to run — it reads transcripts that are already stored, so
 * searching is free in a way transcription never is. No allowance, no
 * provider, no audio.
 */
export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get('q') ?? ''

  try {
    const moments = await searchTranscripts(
      { query },
      { search: new DrizzleTranscriptSearch(database()) },
    )

    return Response.json({ moments })
  } catch (error) {
    console.error('search failed', error)
    return Response.json({ error: 'UNEXPECTED' }, { status: 500 })
  }
}
