import type { AdvanceEpisodeDependencies } from '@overtone/core'
import { GroqTranscriptionProvider } from '@overtone/adapters/groq'
import { RssEpisodeDirectory } from '@overtone/adapters/feed'
import { SupabaseBlobStore } from '@overtone/adapters/supabase'
import { lemmaQuery } from '@overtone/db/lemmas'
import {
  DrizzleAllowanceStore,
  DrizzleChunkStore,
  DrizzleEpisodeStore,
} from '@overtone/db/repositories'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

/**
 * Where the application is assembled.
 *
 * The one module that knows which real thing stands behind each port. Nothing
 * else imports an adapter — that is the rule the whole architecture rests on
 * (ADR 0016), and a composition root is where it is paid for rather than
 * dodged.
 */

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) {
    // Loudly, at the first request, rather than as a confusing failure deeper
    // in. A missing key is a deployment mistake, not a runtime condition.
    throw new Error(`${name} is not set. See .env.example.`)
  }
  return value
}

let db: PostgresJsDatabase | undefined

/**
 * One pool per process.
 *
 * Serverless functions are recycled constantly and a pool per request would
 * exhaust the free tier's connection limit within a minute. `prepare: false`
 * because Supabase's transaction pooler cannot do prepared statements.
 */
export function database(): PostgresJsDatabase {
  db ??= drizzle(postgres(required('DATABASE_URL'), { prepare: false, max: 3 }))
  return db
}

/**
 * The show's own feed, when one is configured.
 *
 * A private feed URL carries its token in the path, so it is as sensitive
 * as a password: it lives in the environment, never in the repository, and
 * never reaches the browser.
 *
 * Absent is an ordinary state — a series with no feed simply keeps the
 * titles read from its filenames.
 */
export function episodeDirectory(feedUrl?: string | null): RssEpisodeDirectory | undefined {
  const url = feedUrl ?? process.env['OVERTONE_FEED_URL']

  return url === undefined || url.length === 0 ? undefined : new RssEpisodeDirectory({ feedUrl: url })
}

export function blobStore(): SupabaseBlobStore {
  return new SupabaseBlobStore({
    projectUrl: required('NEXT_PUBLIC_SUPABASE_URL'),
    secretKey: required('SUPABASE_SECRET_KEY'),
    bucket: process.env['SUPABASE_AUDIO_BUCKET'] ?? 'episode-audio',
  })
}

/** Everything `advanceEpisode` needs, behind the ports it declares. */
export function pipelineDependencies(): AdvanceEpisodeDependencies {
  const connection = database()

  return {
    transcription: new GroqTranscriptionProvider({ apiKey: required('GROQ_API_KEY') }),
    lemmas: {
      // One bulk query for the whole episode's distinct forms. The pure
      // functions never touch a database.
      lookup: async (forms, language) =>
        new Map((await lemmaQuery(connection)(forms, language)).map((row) => [row.form, row.lemma])),
    },
    chunks: new DrizzleChunkStore(connection),
    allowance: new DrizzleAllowanceStore(connection),
    store: new DrizzleEpisodeStore(connection),
    clock: { now: () => Date.now() },
  }
}
