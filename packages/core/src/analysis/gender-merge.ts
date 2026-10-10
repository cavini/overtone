/**
 * Whether a dictionary entry is folding a word into its other gender.
 *
 * The bundled list maps the feminine form of a noun or adjective onto the
 * masculine one — `menina` onto `menino`, `música` onto `músico`, `irmã` onto
 * `irmão`. That is the conventional *citation* form, and it is wrong for this
 * product: the page answers "what did we say", and a daughter is not a son,
 * music is not a musician, and politics is not a politician.
 *
 * **What makes this safe is that a Portuguese infinitive always ends in `-r`.**
 * So a lemma that does not end in `-r` cannot be a verb, and no amount of
 * looking like a vowel swap can make this rule touch `fala` → `falar` or
 * `olha` → `olhar` — which are the groupings most worth keeping, and which a
 * blunter rule destroys.
 *
 * Only the singular. A plural folding into its singular is a collapse of
 * number rather than gender, and that one is wanted.
 */
export function mergesGenderPt(surface: string, lemma: string): boolean {
  if (lemma === surface) return false

  /*
   * professor / professora, and every `-or` noun like it: doutora, autora,
   * cantora. These are the exception to the rule below — a noun that ends in
   * `-r` and is not an infinitive — so they are matched before it.
   *
   * Narrowed to `-ora` rather than "drop a final a", which would also catch
   * the pluperfect: `falara` minus its `a` is exactly `falar`.
   */
  if (surface.endsWith('ora') && lemma === surface.slice(0, -1)) return true

  if (lemma.endsWith('r')) return false

  const swaps = [
    // o ↔ a, the ordinary pair: menino/menina, novo/nova.
    surface.endsWith('o') ? `${surface.slice(0, -1)}a` : undefined,
    surface.endsWith('a') ? `${surface.slice(0, -1)}o` : undefined,
    // ã ↔ ão: irmã/irmão.
    surface.endsWith('ã') ? `${surface.slice(0, -1)}ão` : undefined,
    surface.endsWith('ão') ? `${surface.slice(0, -2)}ã` : undefined,
  ]

  return swaps.includes(lemma)
}
