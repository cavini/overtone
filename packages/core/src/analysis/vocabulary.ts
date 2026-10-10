/**
 * Bumped whenever any of the lists changes — the two below, or the English
 * pair in `vocabulary-en.ts`. Stored alongside every analysis so a count can
 * always be traced to the vocabulary that produced it, and so a change here
 * is a visible reason for numbers to move.
 *
 * **3** — there is a second vocabulary now, and which one was used depends on
 * the episode's language (ADR 0023). The Portuguese lists are untouched.
 */
export const VOCABULARY_VERSION = 3

/**
 * Brazilian Portuguese stop words.
 *
 * These are filtered out of the default "most said" view, never out of
 * storage. Every token is still indexed, `word_count` still includes them,
 * and a stop word named explicitly in a topic is always counted — `com` may
 * be noise on its own and essential inside a phrase someone is tracking.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  // articles
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',

  // prepositions
  'de', 'em', 'para', 'por', 'com', 'sem', 'sobre', 'sob', 'entre', 'até',
  'desde', 'após', 'contra', 'ante', 'perante', 'durante', 'conforme',

  // de + article/demonstrative
  'do', 'da', 'dos', 'das', 'dum', 'duma', 'duns', 'dumas',
  'deste', 'desta', 'destes', 'destas', 'desse', 'dessa', 'desses', 'dessas',
  'daquele', 'daquela', 'daqueles', 'daquelas', 'disto', 'disso', 'daquilo',
  'dele', 'dela', 'deles', 'delas', 'daqui', 'dali',

  // em + article/demonstrative
  'no', 'na', 'nos', 'nas', 'num', 'numa', 'nuns', 'numas',
  'neste', 'nesta', 'nestes', 'nestas', 'nesse', 'nessa', 'nesses', 'nessas',
  'naquele', 'naquela', 'naqueles', 'naquelas', 'nisto', 'nisso', 'naquilo',

  // por + article, a + article
  'pelo', 'pela', 'pelos', 'pelas',
  'ao', 'aos', 'à', 'às', 'àquele', 'àquela', 'àqueles', 'àquelas',

  // para + article, as actually spoken
  'pra', 'pro', 'pras', 'pros',

  // personal pronouns, including the enclitics the tokeniser splits off
  'eu', 'tu', 'ele', 'ela', 'nós', 'vós', 'eles', 'elas',
  'me', 'te', 'se', 'lhe', 'lhes', 'vos', 'lo', 'la', 'los', 'las', 'lho',
  'mim', 'ti', 'si', 'comigo', 'contigo', 'consigo', 'conosco',
  'você', 'vocês', 'cê',

  // possessives
  'meu', 'minha', 'meus', 'minhas', 'teu', 'tua', 'teus', 'tuas',
  'seu', 'sua', 'seus', 'suas', 'nosso', 'nossa', 'nossos', 'nossas',

  // demonstratives
  'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas',
  'aquele', 'aquela', 'aqueles', 'aquelas', 'isto', 'isso', 'aquilo',

  // conjunctions and relatives
  'e', 'ou', 'mas', 'porém', 'contudo', 'todavia', 'entretanto',
  'que', 'como', 'quando', 'porque', 'pois', 'portanto', 'então',
  'embora', 'enquanto', 'nem', 'ora', 'seja',
  'quem', 'qual', 'quais', 'cujo', 'cuja', 'onde', 'quanto', 'quanta',

  // copulas and auxiliaries, which dominate any frequency list
  'ser', 'é', 'são', 'era', 'eram', 'foi', 'foram', 'sou', 'somos',
  'estar', 'está', 'estão', 'estava', 'estavam', 'esteve', 'estou', 'estamos',
  'tá', 'tão', 'tô',
  'ter', 'tem', 'têm', 'tinha', 'tinham', 'teve', 'tenho', 'temos',
  'haver', 'há', 'havia', 'houve',
  'ir', 'vai', 'vão', 'vou', 'vamos', 'ia',
  'fazer', 'faz', 'fez', 'poder', 'pode', 'podem', 'podia',

  // high-frequency adverbs and quantifiers
  'não', 'sim', 'já', 'ainda', 'mais', 'menos', 'muito', 'muita',
  'muitos', 'muitas', 'pouco', 'pouca', 'poucos', 'poucas',
  'todo', 'toda', 'todos', 'todas', 'outro', 'outra', 'outros', 'outras',
  'mesmo', 'mesma', 'também', 'só', 'apenas', 'bem', 'mal',
  'aqui', 'ali', 'lá', 'cá', 'aí', 'agora', 'hoje', 'ontem', 'amanhã',
  'sempre', 'nunca', 'talvez', 'cada', 'algum', 'alguma', 'alguns', 'algumas',
  'nenhum', 'nenhuma', 'nada', 'tudo', 'algo', 'qualquer', 'tanto', 'coisa',
])

/**
 * Non-lexical vocalisations only.
 *
 * Deliberately excludes `é`, which is the verb "to be" and belongs with the
 * stop words — and excludes `né`, `tipo`, `cara` and `sabe`, which are real
 * words with real counts. "You said *tipo* four hundred times this season"
 * is an insight, not noise, so those stay countable.
 */
export const FILLERS: ReadonlySet<string> = new Set([
  'eh', 'ah', 'oh', 'uh', 'ih', 'hum', 'hmm', 'ahn', 'mm', 'hã', 'ahã', 'uhum',
])
