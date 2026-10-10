import type { ReactNode } from 'react'

/**
 * The frame every block on the page sits in.
 *
 * Four panels had copied the same box out of each other, the top margin
 * included — and a margin is how a panel states its distance from a
 * neighbour it cannot see. That worked until one copy was missing it: the
 * upload form had no margin, so it sat flush against the running jokes
 * above. The space between two panels belongs to whatever is stacking
 * them, so there is none here.
 */
export function Panel({
  heading,
  children,
}: {
  readonly heading: string
  readonly children: ReactNode
}) {
  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--edge)', background: 'var(--panel)' }}
    >
      <h2 className="text-xl" style={{ fontFamily: 'var(--font-display)' }}>
        {heading}
      </h2>

      {children}
    </section>
  )
}
