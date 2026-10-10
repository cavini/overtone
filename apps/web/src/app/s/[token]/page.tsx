import { notFound } from 'next/navigation'
import { CountsTable } from '../../../components/counts-table.js'
import { presentAnalysis } from '../../../presenter/episode-view.js'
import { UI } from '../../../i18n/ui.js'
import { sharedEpisode } from '../../../server/sharing.js'

/** Not in anybody's index. A shared link is given out, never found. */
export const metadata = { robots: { index: false, follow: false } }

/**
 * One episode's numbers, for somebody with the link and no account.
 *
 * **Counts and the quotes behind them, never the transcript** (Q17). That
 * holds because of what this reads rather than what it hides: the analysis
 * it renders has no transcript in it, so there is nothing here to remember
 * to strip. One episode — no library, no neighbouring episodes, nothing
 * about whoever shared it.
 *
 * Outside the locale routing, because the link goes into a chat and a path
 * that carries the sharer's language would arrive in the wrong one for
 * everybody else. It renders in Portuguese, which is the language the show
 * is in.
 */
export default async function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const shared = await sharedEpisode(token)

  // A revoked link and a made-up one are the same answer. Which of the two
  // it was is not the visitor's business.
  if (shared === undefined) notFound()

  const labels = UI.pt
  const view = presentAnalysis(shared.analysis, 'pt')

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header>
        <p className="text-sm" style={{ color: 'var(--quiet)' }}>
          {labels.appName}
        </p>
        <h1 className="mt-1 text-3xl" style={{ fontFamily: 'var(--font-display)' }}>
          {shared.title}
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--quiet)' }}>
          {view.durationLabel} · {view.stats.countableWords} {labels.countableWords}
        </p>
      </header>

      <div className="stack mt-8 flex flex-col gap-6">
        <CountsTable labels={labels} analysis={view} />
      </div>

      <footer className="mt-10 border-t pt-5 text-sm" style={{ borderColor: 'var(--edge)' }}>
        <p style={{ color: 'var(--quiet)' }}>{labels.sharedNotice}</p>
        <p className="mt-1" style={{ color: 'var(--quiet)' }}>
          {labels.countsAreOfTheEdit}
        </p>
      </footer>
    </main>
  )
}
