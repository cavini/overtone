-- What the publisher says an episode is about.
--
-- A transcript says what was said; it cannot say who the guest was, what
-- the recurring bit is called, or how the group themselves described the
-- episode. That lives in the show's own feed, keyed by episode number.
--
-- Both nullable. An episode uploaded with no feed to match against has no
-- description, and inventing one would be worse than leaving it empty.

alter table "series"
  add column if not exists "feed_url" text;

alter table "episodes"
  add column if not exists "description" text;
