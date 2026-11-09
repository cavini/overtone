/** Every episode and where it got to. Read-only. */
import { database } from '../src/server/wiring.js'
import { episodes } from '../../../packages/db/src/schema.js'
import { desc } from 'drizzle-orm'

const db = database()
const rows = await db
  .select({
    number: episodes.number,
    title: episodes.title,
    language: episodes.language,
    status: episodes.status,
    durationMs: episodes.durationMs,
    createdAt: episodes.createdAt,
    failureCode: episodes.failureCode,
  })
  .from(episodes)
  .orderBy(desc(episodes.createdAt))
  .limit(25)

console.log(`${rows.length} episodios, mais recentes primeiro\n`)
for (const r of rows) {
  const when = r.createdAt instanceof Date ? r.createdAt.toISOString().slice(0, 16).replace('T', ' ') : String(r.createdAt)
  console.log(
    `  ${when}  #${String(r.number).padStart(3)}  ${String(r.title).slice(0, 34).padEnd(36)}` +
      `${String(r.language).padEnd(3)} ${String(r.status).padEnd(13)}` +
      `${(r.durationMs / 60_000).toFixed(0).padStart(3)}min` +
      (r.failureCode ? `  FALHA=${r.failureCode}` : ''),
  )
}
process.exit(0)
