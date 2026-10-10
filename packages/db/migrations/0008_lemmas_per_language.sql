-- The dictionary gets a second half, so a form is only unique within a language.
--
-- Hand-written because this rewrites a primary key on a table that already
-- holds 825,000 rows, and the order of the four statements is the whole point:
-- the column has to exist and be filled before it can be part of a key.
--
-- `form` alone was enough while there was one language. It stops being enough
-- the moment there are two: `move` is the third person of `mover` in
-- Portuguese and a verb of its own in English, and `come`, `serve` and `parte`
-- are the same. Whichever half loaded second would have overwritten the other,
-- and the analysis would have been handed the wrong language's answer with no
-- sign that anything had happened.

ALTER TABLE "lemmas" ADD COLUMN IF NOT EXISTS "language" text DEFAULT 'pt' NOT NULL;--> statement-breakpoint
ALTER TABLE "lemmas" DROP CONSTRAINT IF EXISTS "lemmas_pkey";--> statement-breakpoint
ALTER TABLE "lemmas" ADD CONSTRAINT "lemmas_pkey" PRIMARY KEY ("language", "form");--> statement-breakpoint
ALTER TABLE "lemmas" DROP CONSTRAINT IF EXISTS "lemmas_language";--> statement-breakpoint
ALTER TABLE "lemmas" ADD CONSTRAINT "lemmas_language" CHECK ("language" in ('pt', 'en'));--> statement-breakpoint
DROP INDEX IF EXISTS "lemmas_lemma";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lemmas_lemma" ON "lemmas" USING btree ("language","lemma");
