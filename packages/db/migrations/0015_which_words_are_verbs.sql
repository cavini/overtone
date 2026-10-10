-- Which spellings are verb forms, so invented verbs can be thrown out.
--
-- The bundled lemma list is mechanically generated and maps plain nouns
-- onto infinitives that barely exist: `gato` onto `gatar`, `filho` onto
-- `filhar`, `bebê` onto `beber`. Measured on a real episode, a quarter of
-- all mentions were labelled with a word nobody had said.
--
-- The list cannot be repaired from its own contents — `filhar` carries
-- sixty inflected forms and `falar` carries fifty-nine, so paradigm size
-- separates nothing. What does separate them is a second source that only
-- contains verbs: UniMorph's Portuguese set, which has no entry for `gato`
-- at all. A lemma that looks like an infinitive, for a form absent from it,
-- is an invention.
--
-- Deliberately not part of `lemmas`. It is a different source under a
-- different licence answering a different question, and joining them would
-- lose track of which said what.

create table if not exists "verb_forms" (
  "language" text not null default 'pt',
  "form" text not null,
  constraint "verb_forms_pk" primary key ("language", "form"),
  constraint "verb_forms_language" check ("language" in ('pt', 'en'))
);

alter table "verb_forms" enable row level security;
