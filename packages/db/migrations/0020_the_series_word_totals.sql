-- The words a series says most, totalled once and read many times.
--
-- The totals only change when an episode finishes analysis or when a line is
-- corrected and the episode is re-derived. Everything else — every page load,
-- every reader, every time the table is folded open — is the same answer, so
-- it is computed when the data behind it changes and not when somebody looks.
--
-- Aggregating per view was the first attempt. It measured fine on one query
-- and was still the wrong shape: repeating work for an answer that has not
-- moved is waste however fast it is, and it is waste on a 500 MB tier.
--
-- One row per series and word. No episode column: this is the whole-series
-- total, and the per-episode numbers already live in `term_counts`, which
-- stays the source this is rebuilt from.
create table if not exists "series_term_totals" (
  "series_id" uuid not null references "series" ("id") on delete cascade,
  "term" text not null,
  "total" integer not null,
  -- How many finished episodes the word appears in. The honest half of the
  -- number: four thousand across twenty-three episodes is how the group
  -- talks, the same total in one episode is one conversation.
  "episodes" integer not null,
  -- True if any episode grouped the word by stemming rather than from the
  -- dictionary. Portuguese stemmers fold `comer` into `com`, so a total
  -- resting partly on a guess must not read as solidly as one that is not.
  "heuristic" boolean not null default false,
  -- When it was last rebuilt, so a stale table can be spotted rather than
  -- trusted.
  "counted_at" timestamptz not null default now(),
  primary key ("series_id", "term")
);

-- The one read there is: the top N of a series, biggest first. A descending
-- index on the total means that read never sorts.
create index if not exists "series_term_totals_ranked"
  on "series_term_totals" ("series_id", "total" desc);

-- Same posture as every other table holding somebody's episodes: row-level
-- security on, reached only through the server, which has already checked who
-- is asking.
alter table "series_term_totals" enable row level security;
