-- Full-text search over what was said.
--
-- Hand-written because this is an expression index, which drizzle-kit does
-- not generate, and because the text-search configuration is the whole
-- point: `portuguese` gives Postgres the stemmer and stop words for the
-- language the audio is actually in. Indexing with `simple` would match
-- "cachorro" and miss "cachorros".
--
-- The index has to use exactly the expression the query uses, or Postgres
-- quietly ignores it and scans every segment of every episode instead.

create index if not exists segments_text_search_ptbr
  on "segments" using gin (to_tsvector('portuguese', "text"));
