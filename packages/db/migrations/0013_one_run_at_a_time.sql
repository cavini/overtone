-- A lease, so two scheduled runs cannot transcribe the same chunk twice.
--
-- The obvious tool is `pg_try_advisory_lock`, and it does not work here. The
-- app connects through Supabase's *transaction* pooler on port 6543, where
-- consecutive statements can land on different backend sessions — so a
-- session-level lock taken by one statement is not held for the next, and a
-- lock held elsewhere is not even seen. Measured: a run acquired the lock
-- while another connection was holding it, which is the failure this was
-- supposed to prevent, arriving silently.
--
-- A conditional UPDATE is atomic in a single statement, so it is correct
-- under any amount of pooling. `held_until` doubles as crash recovery: a run
-- that dies without releasing frees the lease when the lease runs out,
-- rather than wedging the schedule forever.
--
-- One row, enforced by the primary key and the check together.

create table if not exists "advance_lease" (
  "only_row" boolean primary key default true,
  "held_until" timestamptz not null default now(),
  constraint "advance_lease_is_one_row" check ("only_row")
);

insert into "advance_lease" ("only_row") values (true)
  on conflict ("only_row") do nothing;

alter table "advance_lease" enable row level security;
