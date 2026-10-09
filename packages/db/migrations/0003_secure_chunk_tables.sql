-- Row-level security for the two tables chunking brought back.
--
-- Hand-authored for the same reason as 0001: policies need the membership
-- helper, and the security test derives its table list from the schema, so a
-- table added without a policy fails the build. It just did, which is why
-- this file exists.

alter table "chunk_transcripts" enable row level security;
alter table "allowance"        enable row level security;

-- A chunk's transcript belongs to its episode, and an episode to its series.
create policy "chunk_transcripts_member_all" on "chunk_transcripts"
  for all to authenticated
  using (exists (
    select 1 from public.episodes e
     where e.id = chunk_transcripts.episode_id and public.is_series_member(e.series_id)
  ))
  with check (exists (
    select 1 from public.episodes e
     where e.id = chunk_transcripts.episode_id and public.is_series_member(e.series_id)
  ));

-- No policy at all on "allowance", deliberately.
--
-- It is one shared row counting seconds of audio against the whole account,
-- not anybody's data. Only the server touches it, with a key that bypasses
-- row-level security. RLS on with no policy is the deny-all that keeps every
-- ordinary role out — the same arrangement as "heartbeats".
