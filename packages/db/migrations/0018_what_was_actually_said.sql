-- What somebody typed in place of what the transcriber heard.
--
-- An overlay, not an edit. `chunk_transcripts.words` keeps exactly what came
-- back from Whisper, and this sits on top of it — so a correction can be
-- undone by deleting a row, the original is always visible for comparison,
-- and re-analysis picks corrections up for free because it already re-derives
-- everything from the stored chunks.
--
-- Addressed by time rather than by word position. A position shifts the
-- moment an earlier correction changes how many words there are, and word
-- start times run backwards 4.5% of the time in a real episode because
-- people talk over each other — so neither an index nor a slice survives.
-- A span does, and it is what the reader already works in: a line on screen
-- is a stretch of time.
--
-- One correction per span: editing the same line again replaces it.
create table if not exists "episode_corrections" (
  "id" uuid primary key default gen_random_uuid(),
  "episode_id" uuid not null references "episodes" ("id") on delete cascade,
  "from_ms" integer not null,
  "to_ms" integer not null,
  "text" text not null,
  "created_at" timestamptz not null default now(),
  constraint "episode_corrections_span" check ("to_ms" > "from_ms"),
  constraint "episode_corrections_one_per_span" unique ("episode_id", "from_ms")
);

create index if not exists "episode_corrections_episode"
  on "episode_corrections" ("episode_id", "from_ms");

-- Same posture as every other table holding somebody's episode: row-level
-- security on, and reached only through the server, which has already
-- checked who is asking.
alter table "episode_corrections" enable row level security;
