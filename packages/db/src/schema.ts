import { sql } from 'drizzle-orm'
import { AUDIO_LANGUAGES, EPISODE_STATUSES, SERIES_ROLES } from '@overtone/core'
import {
  bigint,
  check,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

/**
 * Overtone's schema.
 *
 * Two decisions shape most of it. **Reads are scoped by membership, never by
 * ownership** — `series_members` exists from this first migration so that
 * inviting a co-host is a row insert rather than a migration touching every
 * query and policy (ADR 0012). And **word timings live as compact JSON on the
 * segment rather than one row per token** — a two-hour episode is roughly
 * 20,000 words, and a row each would exhaust the free database at about 110
 * episodes (ADR 0011).
 *
 * Authentication is Supabase's, so `auth.users` is referenced rather than
 * redefined.
 */

const authUserId = () => uuid('user_id').notNull()

/**
 * Renders `column in ('a', 'b', …)` for a CHECK constraint.
 *
 * The values are inlined with `sql.raw` rather than interpolated. Normal
 * interpolation produces a bind placeholder, which is right for a query and
 * wrong for DDL — a migration has no way to supply `$1`, so the generated SQL
 * simply would not apply. Quotes are escaped even though these values are our
 * own constants.
 *
 * The list comes from the domain, so the constraint in the database and the
 * type in the application are generated from the same declaration.
 */
const inList = (column: AnyPgColumn, values: readonly string[]) => {
  const literals = values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', ')
  return sql`${column} in (${sql.raw(literals)})`
}

export const series = pgTable('series', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Named explicitly rather than through the `authUserId` helper, which calls
  // its column `user_id`. The owner of a series and a member of one are
  // different things, and a shared helper quietly made them the same column.
  ownerId: uuid('owner_id').notNull(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Who can see a series.
 *
 * A new series gets exactly one member, its owner, so this behaves identically
 * to single-owner today. The predicate every read uses is membership, which is
 * what makes a shared show a row insert instead of a rewrite.
 */
export const seriesMembers = pgTable(
  'series_members',
  {
    seriesId: uuid('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    userId: authUserId(),
    role: text('role', { enum: SERIES_ROLES }).notNull().default('host'),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.seriesId, table.userId] }),
    check('series_members_role', inList(table.role, SERIES_ROLES)),
  ],
)

/** A running joke: a name and the spellings that count towards it. */
export const topics = pgTable(
  'topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seriesId: uuid('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('topics_series_name').on(table.seriesId, table.name)],
)

export const topicTerms = pgTable(
  'topic_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    pattern: text('pattern').notNull(),
    /** Separators stripped, so `hotdog`, `hot dog` and `hot-dog` collapse. */
    matchKey: text('match_key').notNull(),
  },
  (table) => [index('topic_terms_match_key').on(table.matchKey)],
)

export const episodes = pgTable(
  'episodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seriesId: uuid('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    recordedOn: date('recorded_on'),
    status: text('status', { enum: EPISODE_STATUSES }).notNull().default('uploaded'),
    /**
     * A code and its data, never a sentence. Nothing below the presenter
     * knows which language the reader wants (ADR 0017).
     */
    failureCode: text('failure_code'),
    failureParams: jsonb('failure_params'),
    pipelineVersion: integer('pipeline_version').notNull().default(1),
    durationMs: integer('duration_ms').notNull().default(0),
    /**
     * What the audio is spoken in, settled when the episode was uploaded.
     *
     * Stored rather than derived, because it is a fact about this episode
     * and not about whoever is reading it. Changing the interface language
     * later must not retell what an existing episode was transcribed as
     * (ADR 0022).
     */
    language: text('language', { enum: AUDIO_LANGUAGES }).notNull().default('pt'),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull().default(0),
    blobKey: text('blob_key'),
    /** Present means the stats page is public to anyone holding the link. */
    shareToken: text('share_token').unique(),
    audioPurgedAt: timestamp('audio_purged_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('episodes_series_number').on(table.seriesId, table.number),
    index('episodes_series_status').on(table.seriesId, table.status),
    check('episodes_language', inList(table.language, AUDIO_LANGUAGES)),
    // Drizzle's `enum` option is a TypeScript nicety; without this the column
    // is plain `text` and the database would accept any string at all.
    check('episodes_status', inList(table.status, EPISODE_STATUSES)),
  ],
)

/**
 * One chunk's transcript, stored the moment it arrives.
 *
 * An episode of this show is longer than the hourly allowance, so
 * transcription spans hours and process lifetimes (ADR 0020). Each chunk is
 * paid for out of a budget of three episodes a day, which makes losing one
 * the mistake most worth designing against — so it is durable immediately,
 * before the spend is even recorded.
 *
 * `offsetMs` is where the chunk actually began, not where the plan said it
 * would: the encoder moves each boundary to the nearest silence, and stitching
 * must use the real offset or every timestamp after the join points at the
 * wrong moment.
 */
export const chunkTranscripts = pgTable(
  'chunk_transcripts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    episodeId: uuid('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    index: integer('index').notNull(),
    offsetMs: integer('offset_ms').notNull(),
    /** `[{ text, startMs, endMs }, …]`, relative to the chunk. */
    words: jsonb('words').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('chunk_transcripts_episode_index').on(table.episodeId, table.index)],
)

/**
 * The transcription allowance, as one shared row.
 *
 * Shared, not per-user and not per-episode: the free tier counts seconds of
 * audio against one account, so two people uploading at once spend the same
 * budget. A single row by construction, like `heartbeats`.
 *
 * Written only by the server, which holds a key that bypasses row-level
 * security — hence no policy below, which denies everyone else.
 */
export const allowance = pgTable('allowance', {
  // One account, one budget, one row.
  id: smallint('id').primaryKey().default(1),
  // The hourly allowance is a bucket that refills continuously, so a balance
  // is only true at an instant (ADR 0021, experiment 0003).
  remainingAudioMs: bigint('remaining_audio_ms', { mode: 'number' }).notNull().default(0),
  asOf: timestamp('as_of', { withTimezone: true }).notNull().defaultNow(),
  // The daily cap is not reported by the provider, so it stays a tally
  // against a window that turns over. The last modelled limit here.
  dailyUsedMs: bigint('daily_used_ms', { mode: 'number' }).notNull().default(0),
  dayResetsAt: timestamp('day_resets_at', { withTimezone: true }).notNull().defaultNow(),
})

export const transcripts = pgTable('transcripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  episodeId: uuid('episode_id')
    .notNull()
    .references(() => episodes.id, { onDelete: 'cascade' })
    .unique(),
  provider: text('provider').notNull(),
  providerModel: text('provider_model').notNull(),
  /**
   * The provider's answer, untouched. Never discarded: it is what lets every
   * derived number be recomputed when the analysis improves, without spending
   * the transcription allowance again (ADR 0005).
   */
  rawProviderPayload: jsonb('raw_provider_payload').notNull(),
  fullText: text('full_text').notNull(),
  qualityScore: smallint('quality_score'),
  normalizationVersion: integer('normalization_version').notNull().default(1),
  vocabularyVersion: integer('vocabulary_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const segments = pgTable(
  'segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transcriptId: uuid('transcript_id')
      .notNull()
      .references(() => transcripts.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    text: text('text').notNull(),
    /**
     * `[[surface, lemma, startMs, endMs, class], …]`.
     *
     * One row per token would be ~20,000 rows and 4–5 MB per episode, filling
     * the free database at around 110 episodes. Counting reads `term_counts`;
     * this is read only for the handful of segments actually on screen.
     */
    words: jsonb('words').notNull(),
  },
  (table) => [
    unique('segments_transcript_position').on(table.transcriptId, table.position),
    index('segments_transcript_start').on(table.transcriptId, table.startMs),
  ],
)

export const insights = pgTable('insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  episodeId: uuid('episode_id')
    .notNull()
    .references(() => episodes.id, { onDelete: 'cascade' })
    .unique(),
  pipelineVersion: integer('pipeline_version').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  wordTokens: integer('word_tokens').notNull(),
  stopWordTokens: integer('stop_word_tokens').notNull(),
  fillerTokens: integer('filler_tokens').notNull(),
  uniqueTerms: integer('unique_terms').notNull(),
  wordsPerMinute: real('words_per_minute').notNull(),
  fillersPerMinute: real('fillers_per_minute').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Materialised per episode and lemma.
 *
 * The series rollup — the feature the product exists for — is a `sum` over a
 * few thousand small rows here, rather than an aggregate over millions of
 * tokens. It is also the table the assistant will query for "how many times
 * ever", which is why it exists before the assistant does (ADR 0007).
 */
export const termCounts = pgTable(
  'term_counts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    episodeId: uuid('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    lemma: text('lemma').notNull(),
    surfaceForms: text('surface_forms').array().notNull(),
    count: integer('count').notNull(),
    /** True when the stemmer grouped it, so the UI can mark it a guess. */
    heuristic: boolean('heuristic').notNull().default(false),
  },
  (table) => [
    unique('term_counts_episode_lemma').on(table.episodeId, table.lemma),
    index('term_counts_lemma').on(table.lemma),
  ],
)

export const mentions = pgTable(
  'mentions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    episodeId: uuid('episode_id')
      .notNull()
      .references(() => episodes.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    segmentId: uuid('segment_id').references(() => segments.id, { onDelete: 'set null' }),
    matchedText: text('matched_text').notNull(),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
  },
  (table) => [index('mentions_episode_topic').on(table.episodeId, table.topicId)],
)

/**
 * A saved question.
 *
 * First-class because the dashboard and the future assistant run the *same*
 * query through the same engine — which is the structural reason chat and the
 * series page can never disagree about a number (ADR 0007).
 */
export const queries = pgTable('queries', {
  id: uuid('id').primaryKey().defaultRandom(),
  seriesId: uuid('series_id')
    .notNull()
    .references(() => series.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  spec: jsonb('spec').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * The Portuguese lemma dictionary: 825,000 rows, static, shared by everyone.
 *
 * Not bundled into the application. A use case asks for the few thousand
 * forms one episode actually used and hands the result to the analysis as a
 * plain map, which is how a dictionary-backed lemmatiser coexists with an
 * analysis layer that does no I/O (ADRs 0014, 0016, 0019).
 */
export const lemmas = pgTable(
  'lemmas',
  {
    /**
     * Which half of the dictionary a row belongs to.
     *
     * Part of the primary key, because a spelling is not unique across
     * languages: `move`, `come`, `serve` and `parte` are all inflections of
     * a Portuguese verb *and* English words in their own right. With `form`
     * alone as the key, whichever language loaded second would overwrite the
     * other and the analysis would be handed the wrong answer silently.
     */
    language: text('language').notNull().default('pt'),
    form: text('form').notNull(),
    lemma: text('lemma').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.language, table.form] }),
    check('lemmas_language', inList(table.language, AUDIO_LANGUAGES)),
    index('lemmas_lemma').on(table.language, table.lemma),
  ],
)

/**
 * Keeps a free Supabase project from pausing after seven idle days.
 *
 * A single row by construction: `id` is the primary key and defaults to 1, so
 * a second insert collides with the first and the daily ping is an upsert.
 */
export const heartbeats = pgTable('heartbeats', {
  id: smallint('id').primaryKey().default(1),
  pingedAt: timestamp('pinged_at', { withTimezone: true }).notNull().defaultNow(),
})
