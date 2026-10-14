/**
 * Gives episodes the names they should have had.
 *
 * Episodes uploaded before titles were derived kept their filename —
 * `chuva-de-canivetes-201` rather than `Chuva de Canivetes #201`. This reads
 * the number out of whatever title they have, asks the show's feed what that
 * episode is really called, and writes it back along with the show notes.
 *
 * Safe to run repeatedly: it only writes when it has something better than
 * what is already stored, and it never invents a title for an episode the
 * feed has not heard of.
 *
 *   pnpm --filter @overtone/db db:rename-episodes
 *   pnpm --filter @overtone/db db:rename-episodes -- --dry-run
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RssEpisodeDirectory } from '@overtone/adapters/feed'
import { readEpisodeName } from '@overtone/core'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { episodes } from './schema.js'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const dryRun = process.argv.includes('--dry-run')
const url = process.env['DATABASE_URL']
const feedUrl = process.env['OVERTONE_FEED_URL']

if (url === undefined || url.length === 0) {
  console.error('DATABASE_URL is not set. See .env.example.')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} })
const db = drizzle(sql)
const directory = feedUrl === undefined || feedUrl.length === 0
  ? undefined
  : new RssEpisodeDirectory({ feedUrl })

if (directory === undefined) {
  console.log('no OVERTONE_FEED_URL set — titles will only be tidied, not looked up\n')
}

try {
  const all = await db
    .select({ id: episodes.id, number: episodes.number, title: episodes.title })
    .from(episodes)

  let changed = 0

  for (const episode of all) {
    const named = readEpisodeName(episode.title)
    const published = named.number === undefined ? undefined : await directory?.find(named.number)

    const title = published?.title ?? named.title
    if (title.length === 0 || title === episode.title) continue

    console.log(`  #${episode.number}  ${episode.title}  ->  ${title}`)
    changed += 1

    if (dryRun) continue

    await db
      .update(episodes)
      .set({
        title,
        ...(published === undefined ? {} : { description: published.description }),
      })
      .where(eq(episodes.id, episode.id))
  }

  console.log(
    changed === 0
      ? '\n  every episode already has the best name available'
      : `\n  ${dryRun ? 'would rename' : 'renamed'} ${changed} of ${all.length}`,
  )
} finally {
  await sql.end()
}
