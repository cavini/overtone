-- Row-level security.
--
-- Hand-authored rather than generated: policies need a SECURITY DEFINER
-- helper, and expressing that through the schema builder would obscure the one
-- thing worth reading carefully.
--
-- The classic Supabase data leak is a table that was added later and never had
-- RLS switched on. Every table below is listed explicitly, and a test asserts
-- that the set here matches the set in the schema — so adding a table without
-- a policy fails the build rather than quietly exposing a group's episodes.

-- Membership, resolved once.
--
-- SECURITY DEFINER matters: a policy on `series_members` that queries
-- `series_members` recurses, and Postgres will refuse. Resolving membership
-- inside a definer-rights function breaks that cycle. `search_path` is pinned
-- because a definer-rights function with a mutable search path is a privilege
-- escalation waiting to happen.
create or replace function public.is_series_member(target_series uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.series_members
     where series_members.series_id = target_series
       and series_members.user_id = auth.uid()
  );
$$;

revoke all on function public.is_series_member(uuid) from public;
grant execute on function public.is_series_member(uuid) to authenticated;

alter table "series"          enable row level security;
alter table "series_members" enable row level security;
alter table "topics"         enable row level security;
alter table "topic_terms"    enable row level security;
alter table "episodes"       enable row level security;
alter table "transcripts"    enable row level security;
alter table "segments"       enable row level security;
alter table "insights"       enable row level security;
alter table "term_counts"    enable row level security;
alter table "mentions"       enable row level security;
alter table "queries"        enable row level security;
alter table "lemmas"         enable row level security;
alter table "heartbeats"     enable row level security;

-- A series is visible to its members. Only its owner can rename or delete it.
create policy "series_member_read" on "series"
  for select to authenticated
  using (public.is_series_member(id));

create policy "series_owner_write" on "series"
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Deliberately narrow, and deliberately not recursive: a member sees their own
-- membership row. Listing co-hosts is a separate, later feature, and it will
-- go through a function rather than by widening this.
create policy "series_members_read_own" on "series_members"
  for select to authenticated
  using (user_id = auth.uid());

create policy "series_members_owner_write" on "series_members"
  for all to authenticated
  using (exists (
    select 1 from public.series s
     where s.id = series_members.series_id and s.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.series s
     where s.id = series_members.series_id and s.owner_id = auth.uid()
  ));

-- Everything that hangs off a series.
create policy "topics_member_all" on "topics"
  for all to authenticated
  using (public.is_series_member(series_id))
  with check (public.is_series_member(series_id));

create policy "episodes_member_all" on "episodes"
  for all to authenticated
  using (public.is_series_member(series_id))
  with check (public.is_series_member(series_id));

create policy "queries_member_all" on "queries"
  for all to authenticated
  using (public.is_series_member(series_id))
  with check (public.is_series_member(series_id));

create policy "topic_terms_member_all" on "topic_terms"
  for all to authenticated
  using (exists (
    select 1 from public.topics t
     where t.id = topic_terms.topic_id and public.is_series_member(t.series_id)
  ))
  with check (exists (
    select 1 from public.topics t
     where t.id = topic_terms.topic_id and public.is_series_member(t.series_id)
  ));

create policy "transcripts_member_all" on "transcripts"
  for all to authenticated
  using (exists (
    select 1 from public.episodes e
     where e.id = transcripts.episode_id and public.is_series_member(e.series_id)
  ))
  with check (exists (
    select 1 from public.episodes e
     where e.id = transcripts.episode_id and public.is_series_member(e.series_id)
  ));

create policy "segments_member_all" on "segments"
  for all to authenticated
  using (exists (
    select 1 from public.transcripts tr
      join public.episodes e on e.id = tr.episode_id
     where tr.id = segments.transcript_id and public.is_series_member(e.series_id)
  ))
  with check (exists (
    select 1 from public.transcripts tr
      join public.episodes e on e.id = tr.episode_id
     where tr.id = segments.transcript_id and public.is_series_member(e.series_id)
  ));

create policy "insights_member_all" on "insights"
  for all to authenticated
  using (exists (
    select 1 from public.episodes e
     where e.id = insights.episode_id and public.is_series_member(e.series_id)
  ))
  with check (exists (
    select 1 from public.episodes e
     where e.id = insights.episode_id and public.is_series_member(e.series_id)
  ));

create policy "term_counts_member_all" on "term_counts"
  for all to authenticated
  using (exists (
    select 1 from public.episodes e
     where e.id = term_counts.episode_id and public.is_series_member(e.series_id)
  ))
  with check (exists (
    select 1 from public.episodes e
     where e.id = term_counts.episode_id and public.is_series_member(e.series_id)
  ));

create policy "mentions_member_all" on "mentions"
  for all to authenticated
  using (exists (
    select 1 from public.episodes e
     where e.id = mentions.episode_id and public.is_series_member(e.series_id)
  ))
  with check (exists (
    select 1 from public.episodes e
     where e.id = mentions.episode_id and public.is_series_member(e.series_id)
  ));

-- The dictionary is shared open data under ODbL, the same for everyone, and
-- carries nothing about anybody. Readable by any signed-in user; writable only
-- by the migration, which runs as the owner.
create policy "lemmas_read" on "lemmas"
  for select to authenticated
  using (true);

-- No policy at all on "heartbeats": RLS is on, so every ordinary role is
-- denied, and the keep-alive cron runs with the service key, which bypasses
-- it. An empty policy set is the deny-all.

-- A public share link is deliberately NOT an RLS policy. An anonymous visitor
-- cannot be asked which episode they are allowed to see, and a policy broad
-- enough to let them look would be broad enough to enumerate. The shared page
-- is served by a route that checks the token itself and reads with the service
-- key, so exactly one episode is ever returned.
