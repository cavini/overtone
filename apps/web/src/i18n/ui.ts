import type { Locale } from '@overtone/messages'

/**
 * Interface chrome — buttons, headings, column titles.
 *
 * Deliberately *not* in `packages/messages`. That catalogue holds the typed
 * message codes the domain emits (ADR 0017): things with parameters, that a
 * use case can decide to say. These are labels on furniture, which no layer
 * below the presenter has an opinion about. Mixing them would make the
 * domain's vocabulary look twice as large as it is.
 */
export const UI = {
  pt: {
    appName: 'Overtone',
    tagline: 'Análise do que foi dito no episódio',
    uploadHeading: 'Enviar um episódio',
    uploadHint: 'Escolha o arquivo final editado. Português do Brasil.',
    uploadButton: 'Analisar',
    uploading: 'Enviando…',
    chooseFile: 'Escolher arquivo',
    noFile: 'Nenhum arquivo escolhido',
    resultsHeading: 'Resultado',
    mostSaid: 'Mais falado',
    term: 'Palavra',
    count: 'Vezes',
    forms: 'Formas',
    guessed: 'agrupado por semelhança',
    runningJokes: 'Piadas recorrentes',
    moments: 'Momentos',
    duration: 'Duração',
    totalWords: 'Palavras',
    countableWords: 'Palavras contáveis',
    uniqueTerms: 'Termos distintos',
    wordsPerMinute: 'Palavras por minuto',
    fillersPerMinute: 'Vícios por minuto',
    language: 'Idioma',
    nothingYet: 'Envie um episódio para ver os números.',
  },
  en: {
    appName: 'Overtone',
    tagline: 'What was actually said, counted',
    uploadHeading: 'Upload an episode',
    uploadHint: 'Pick the final edited file. Brazilian Portuguese.',
    uploadButton: 'Analyse',
    uploading: 'Uploading…',
    chooseFile: 'Choose file',
    noFile: 'No file chosen',
    resultsHeading: 'Result',
    mostSaid: 'Most said',
    term: 'Word',
    count: 'Times',
    forms: 'Forms',
    guessed: 'grouped by resemblance',
    runningJokes: 'Running jokes',
    moments: 'Moments',
    duration: 'Duration',
    totalWords: 'Words',
    countableWords: 'Countable words',
    uniqueTerms: 'Distinct terms',
    wordsPerMinute: 'Words per minute',
    fillersPerMinute: 'Fillers per minute',
    language: 'Language',
    nothingYet: 'Upload an episode to see the numbers.',
  },
} as const satisfies Record<Locale, Record<string, string>>

export type UiKey = keyof typeof UI.en
