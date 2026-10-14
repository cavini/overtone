-- Which programme an episode is.
--
-- The group publishes several shows from one feed — Chuva de Canivetes, Outro
-- Programa, Terceiro Programa, Quarto Programa — and they share hosts, things
-- and running jokes. So they belong in one library rather than one library each:
-- a label on the episode, not a series of its own.
--
-- That distinction is the whole design. Topics hang off the series, so a
-- joke stays countable across programmes; search is scoped by series and
-- nothing narrower, so it stays universal. Splitting the shows into separate
-- series would have broken both, quietly, while looking tidier.
--
-- Nullable: an episode whose filename carries no number has no programme to
-- read out of it, and inventing one would file it under a show that does not
-- exist.
alter table "episodes" add column if not exists "category" text;

-- Numbering is per programme now.
--
-- Each show counts from 1, so two of them having a first episode is the
-- normal case, not a conflict — while the same number twice within one
-- programme is still the duplicate upload this constraint has always been
-- here to refuse.
--
-- `nulls not distinct` because Postgres otherwise treats each NULL as its own
-- value: two uncategorised episodes numbered the same would be waved through,
-- and those are a duplicate rather than two programmes.
alter table "episodes" drop constraint if exists "episodes_series_number";

alter table "episodes"
  add constraint "episodes_series_number"
  unique nulls not distinct ("series_id", "category", "number");

-- The library lists a category at a time, so this is the order it reads in.
create index if not exists "episodes_series_category"
  on "episodes" ("series_id", "category", "number");
