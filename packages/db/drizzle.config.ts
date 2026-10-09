import { defineConfig } from 'drizzle-kit'

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
