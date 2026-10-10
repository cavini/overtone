-- The same segments, indexed for English as well.
--
-- A second index rather than a replacement, because both are needed. The
-- `portuguese` configuration knows Portuguese verb morphology and Portuguese
-- stop words, which `english` does not and never will. But it also leaves an
-- English loanword where it found it: `deploys` stays `deploys`, so a search
-- for `deploy` misses it, and the archive is full of them. The English
-- configuration reduces both to `deploy`.
--
-- It earns its place on Portuguese too. The Portuguese Snowball stemmer only
-- strips a suffix inside the word's RV region, which for a short word is
-- empty — so `anos`, `dias`, `pais` and `bets` keep their plural `s` and a
-- search for `ano` found none of the 133 segments that say `anos`. The
-- English stemmer strips them.
--
-- Hand-written because this is an expression index, which drizzle-kit does
-- not generate, and the expression has to match the query exactly or
-- Postgres quietly scans every segment of every episode instead.

create index if not exists segments_text_search_en
  on "segments" using gin (to_tsvector('english', "text"));
