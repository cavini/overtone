import type { AudioLanguage } from '../domain/audio-language.js'
import type { LemmaLookup } from '../domain/token.js'

export interface LemmaRepository {
  /**
   * Resolves many surface forms at once.
   *
   * Deliberately bulk. An episode holds a few thousand distinct forms, and
   * asking per token would be a few thousand round trips; asking once keeps
   * the dictionary in a database without the analysis ever touching one.
   * Forms with no entry are simply absent from the result.
   *
   * Scoped to a language, because a spelling is not unique across them.
   * `move` is the third person of `mover` in Portuguese and a verb of its
   * own in English; `come`, `serve` and `parte` are the same. An unscoped
   * lookup would hand the analysis the other language's answer for every one
   * of them.
   */
  lookup(forms: readonly string[], language: AudioLanguage): Promise<LemmaLookup>
  /**
   * Which of these the language's morphology knows as verb forms.
   *
   * Used to throw out invented verbs. The bundled lemma list is
   * mechanically generated and maps plain nouns onto infinitives that
   * barely exist — `gato` onto `gatar`, `filho` onto `filhar`, `bebê` onto
   * `beber` — so the page showed words nobody had said. A lemma that looks
   * like an infinitive, for a form that no morphology knows as a verb form,
   * is an invention (ADR 0029).
   *
   * Bulk and language-scoped for the same reasons as `lookup`. Absent means
   * "not known as a verb form", which is the whole signal.
   */
  verbForms(forms: readonly string[], language: AudioLanguage): Promise<ReadonlySet<string>>
}
