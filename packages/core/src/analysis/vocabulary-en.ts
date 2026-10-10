/**
 * English stop words and fillers.
 *
 * The companion to `vocabulary.ts`, which is Portuguese. Two lists rather
 * than one union, because the overlap is not harmless: `a`, `e`, `me`, `no`,
 * `do` and `as` are function words in both languages, but `era`, `tem`,
 * `sem` and `for` are a stop word in one and a countable noun or verb in the
 * other. Merging the lists would suppress a word in the language where it
 * means something.
 *
 * Same contract as the Portuguese list: these decide what the default "most
 * said" view hides, never what is stored. Every token is still indexed and
 * still counted, and a stop word named in a topic is always counted.
 */

/** Both spellings of the apostrophe, because Whisper writes either one. */
const TYPEWRITER = "'"
const TYPOGRAPHIC = '’'

const bothApostrophes = (word: string): string[] => [
  word,
  word.replaceAll(TYPEWRITER, TYPOGRAPHIC),
]

/**
 * Auxiliaries that contract with `not`.
 *
 * Held as the part before `n't` so that the irregular ones come out right:
 * `can't` and `won't` do not contract from `can` and `will`, which is also
 * why the tokeniser leaves these whole instead of peeling the suffix off.
 */
const NEGATED = [
  'do', 'does', 'did',
  'is', 'are', 'was', 'were',
  'have', 'has', 'had',
  'would', 'could', 'should', 'might', 'must', 'need', 'dare',
  // Irregular: `can't`, `won't`, `shan't`, `ain't`.
  'ca', 'wo', 'sha', 'ai',
]

export const STOP_WORDS_EN: ReadonlySet<string> = new Set([
  // articles and determiners
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'each', 'every', 'either', 'neither', 'another', 'such',

  // prepositions
  'of', 'in', 'on', 'at', 'to', 'for', 'with', 'without', 'from', 'by',
  'about', 'into', 'onto', 'upon', 'over', 'under', 'above', 'below',
  'between', 'among', 'through', 'during', 'before', 'after', 'since',
  'until', 'till', 'against', 'towards', 'toward', 'across', 'behind',
  'beyond', 'within', 'along', 'around', 'off', 'out', 'up', 'down',
  'near', 'per', 'via', 'than', 'as',

  // pronouns
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us',
  'them', 'myself', 'yourself', 'himself', 'herself', 'itself',
  'ourselves', 'yourselves', 'themselves', 'one', 'ones', 'oneself',

  // possessives
  'my', 'your', 'his', 'its', 'our', 'their',
  'mine', 'yours', 'hers', 'ours', 'theirs', 'whose',

  // the copula and the auxiliaries, which dominate any frequency list
  'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'done', 'doing',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might',
  'must', 'ought',

  // conjunctions, relatives and interrogatives
  'and', 'or', 'but', 'nor', 'so', 'yet', 'if', 'then', 'else',
  'because', 'although', 'though', 'unless', 'whereas', 'while', 'whilst',
  'who', 'whom', 'which', 'what', 'when', 'where', 'why', 'how',
  'whether', 'whatever', 'whenever', 'wherever', 'whoever',

  // negation and affirmation
  'not', 'no', 'yes', 'yeah', 'yep', 'nope', 'nah', 'none',

  // high-frequency adverbs and quantifiers
  'all', 'any', 'both', 'few', 'more', 'most', 'other', 'others', 'some',
  'same', 'very', 'too', 'also', 'just', 'only', 'even', 'still', 'again',
  'ever', 'never', 'always', 'already', 'almost', 'quite', 'rather',
  'much', 'many', 'enough', 'less', 'least',
  'here', 'there', 'now', 'once', 'twice',
  'anything', 'something', 'nothing', 'everything',
  'anyone', 'someone', 'everyone', 'nobody', 'somebody', 'anybody',
  'anyway', 'anywhere', 'somewhere', 'everywhere', 'nowhere',

  // what a split contraction leaves behind: `it's` is `it` and `s`
  's', 'd', 'm', 've', 'll', 're',

  // contracted negatives, kept whole
  ...NEGATED.flatMap((auxiliary) => bothApostrophes(`${auxiliary}n${TYPEWRITER}t`)),
])

/**
 * Non-lexical vocalisations only.
 *
 * Excludes `like`, `right`, `well`, `actually` and `basically` for the
 * same reason the Portuguese list excludes `tipo`, `né` and `sabe`: they are
 * real words, and "you said *like* four hundred times this season" is an
 * insight rather than noise. Classing them as fillers would fold them into a
 * rate and take them out of the frequency list, which is the one place
 * anyone would look for them.
 */
export const FILLERS_EN: ReadonlySet<string> = new Set([
  'uh', 'um', 'er', 'erm', 'ah', 'oh', 'eh',
  'hm', 'hmm', 'mm', 'mmm', 'mhm', 'huh',
  'uh-huh', 'mm-hmm',
])
