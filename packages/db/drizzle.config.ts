import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'drizzle-kit'

/**
 * Secrets live in `.env.local` at the repository root, gitignored.
 *
 * Loaded here rather than through a dotenv dependency: Node can do it, and
 * `drizzle-kit` is a binary that will not pick the file up by itself.
 *
 * Found by walking up from the working directory rather than from this file's
 * own path — `drizzle-kit` loads the config through a bundler that does not
 * supply `import.meta.dirname`, and this works whichever directory the
 * command was run from.
 */
function findEnvFile(): string | undefined {
  let directory = process.cwd()

  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = resolve(directory, '.env.local')
    if (existsSync(candidate)) return candidate

    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }

  return undefined
}

const envFile = findEnvFile()
if (envFile !== undefined) process.loadEnvFile(envFile)

/**
 * Migrations are generated from the schema and checked in as plain SQL, so a
 * change to the database is reviewable in a diff rather than inferred from a
 * TypeScript file.
 */
export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/overtone',
  },
  // Supabase owns `auth`; we only reference it.
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
})
