-- What an episode is spoken in.
--
-- Until now it was a constant: ADR 0014 fixed every episode at Brazilian
-- Portuguese and forbade the interface from influencing it. ADR 0022
-- reverses that — the language is chosen when an episode is uploaded and
-- recorded with it, so that switching the interface later cannot retell
-- what an existing episode was transcribed as.
--
-- Defaulted to 'pt' so every episode already in the table keeps the truth
-- about itself: they were all transcribed as Portuguese.

alter table "episodes"
  add column if not exists "language" text not null default 'pt';

alter table "episodes"
  drop constraint if exists "episodes_language";

alter table "episodes"
  add constraint "episodes_language" check ("language" in ('pt', 'en'));
