import type { AnalysisView } from '../presenter/episode-view.js'
import type { UiKey } from '../i18n/ui.js'

type Labels = Record<UiKey, string>

/**
 * The numbers, which are the product.
 *
 * Monospaced and tabular so the digits line up down the column, and the table
 * scrolls inside its own box so the page never scrolls sideways on a phone —
 * which is where the stakeholder said this would be used.
 */
export function CountsTable({
  analysis,
  labels,
}: {
  readonly analysis: AnalysisView
  readonly labels: Labels
}) {
  if (analysis.terms.length === 0) return null

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-xl" style={{ fontFamily: 'var(--font-display)' }}>
        {labels.mostSaid}
      </h2>

      <div
        className="scroller rounded-lg border"
        style={{ borderColor: 'var(--edge)', background: 'var(--panel)' }}
      >
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr style={{ color: 'var(--quiet)' }}>
              <th scope="col" className="px-4 py-3 font-medium">{labels.term}</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">{labels.count}</th>
              <th scope="col" className="px-4 py-3 font-medium">{labels.forms}</th>
            </tr>
          </thead>
          <tbody>
            {analysis.terms.map((row) => (
              <tr key={row.term} style={{ borderTop: '1px solid var(--edge)' }}>
                <th scope="row" className="px-4 py-2.5 font-medium">
                  {row.term}
                  {row.heuristic ? (
                    <span
                      className="ml-2 align-middle text-xs"
                      style={{ color: 'var(--accent-quiet)' }}
                      title={row.heuristicNotice}
                    >
                      ~ {labels.guessed}
                    </span>
                  ) : null}
                </th>
                <td className="tabular px-4 py-2.5 text-right">{row.count}</td>
                <td className="px-4 py-2.5" style={{ color: 'var(--quiet)' }}>
                  {row.forms}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** A figure and what it is, for the strip above the table. */
export function StatStrip({
  analysis,
  labels,
}: {
  readonly analysis: AnalysisView
  readonly labels: Labels
}) {
  const figures: ReadonlyArray<readonly [string, string]> = [
    [labels.duration, analysis.durationLabel],
    [labels.totalWords, analysis.stats.totalWords],
    [labels.countableWords, analysis.stats.countableWords],
    [labels.uniqueTerms, analysis.stats.uniqueTerms],
    [labels.wordsPerMinute, analysis.stats.wordsPerMinute],
    [labels.fillersPerMinute, analysis.stats.fillersPerMinute],
  ]

  return (
    <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border sm:grid-cols-3"
      style={{ borderColor: 'var(--edge)', background: 'var(--edge)' }}
    >
      {figures.map(([label, value]) => (
        <div key={label} className="px-4 py-3" style={{ background: 'var(--panel)' }}>
          <dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--quiet)' }}>
            {label}
          </dt>
          <dd className="tabular mt-1 text-2xl" style={{ color: 'var(--accent)' }}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Running jokes, with the moment each one was said. */
export function JokeList({
  analysis,
  labels,
}: {
  readonly analysis: AnalysisView
  readonly labels: Labels
}) {
  if (analysis.topics.length === 0) return null

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-xl" style={{ fontFamily: 'var(--font-display)' }}>
        {labels.runningJokes}
      </h2>
      <ul className="space-y-2">
        {analysis.topics.map((topic) => (
          <li
            key={topic.name}
            className="rounded-lg border px-4 py-3"
            style={{ borderColor: 'var(--edge)', background: 'var(--panel)' }}
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-medium">{topic.name}</span>
              <span className="tabular text-lg" style={{ color: 'var(--accent)' }}>
                {topic.count}
              </span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: 'var(--quiet)' }}>
              {topic.moments.map((moment) => (
                <li key={moment.startMs}>
                  <span className="tabular">{moment.at}</span>{' '}
                  <span>“{moment.quote}”</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  )
}
