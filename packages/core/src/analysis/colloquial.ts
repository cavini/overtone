/**
 * Where the dictionary is right about Portuguese and wrong about people.
 *
 * The ODbL lemma list (ADR 0019) is a general Portuguese resource and it is
 * not making mistakes: `cara` really is the feminine of the adjective `caro`,
 * and `verde` really can be a form of `ver`. But this product counts what
 * friends say to each other on a podcast, and in that register `cara` means
 * "dude" every single time.
 *
 * Every entry here was found in a real episode, not imagined. `cara` was the
 * most-said word of a two-hour episode — 311 of them — and the product
 * reported them all as "expensive". Worse, it reported it without a warning:
 * the heuristic flag only marks groupings the *stemmer* guessed at, and
 * these came from the dictionary, which is supposed to be the reliable tier.
 *
 * Keep this list short and keep it evidence-led. It is a patch over a good
 * resource, not a dictionary of our own, and every entry is a place where
 * we have decided we know better than a lexicographer.
 */
export const COLLOQUIAL_LEMMAS: Readonly<Record<string, string>> = {
  // "dude", by far the most common noun in casual Brazilian speech. The
  // dictionary sends it to the adjective "expensive".
  cara: 'cara',
  caras: 'cara',
  // "affection". Also sent to "expensive", which it is not.
  carinho: 'carinho',
  carinhos: 'carinho',
  // "bro". The dictionary sends it to `manar`, a verb nobody says.
  mano: 'mano',
  manos: 'mano',
  mana: 'mana',
  manas: 'mana',
  // "half", and as an adverb "sort of" — which is how it is mostly used.
  // The dictionary sends both to `mear`.
  meio: 'meio',
  meios: 'meio',
  // Kept apart from `meio` on purpose: "meia" is also a sock, and merging
  // the two would count garments as fractions.
  meia: 'meia',
  meias: 'meia',
  // "a half" is not "two".
  metade: 'metade',
  metades: 'metade',
  // "green" is not "to see".
  verde: 'verde',
  verdes: 'verde',
}
