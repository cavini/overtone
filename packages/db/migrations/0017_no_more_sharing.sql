-- Sharing is gone, and so is the column that held its tokens.
--
-- A share link opened one episode's counts and quotes to anybody holding an
-- unguessable URL. It worked — the token was the permission, the page showed
-- counts and never the transcript — and the group did not want it.
--
-- Dropped rather than left behind, because a nullable column nothing writes
-- is the kind of thing that reads as a feature later. Nothing was shared at
-- the time this ran, so no live link was broken by it.
alter table "episodes" drop column if exists "share_token";
