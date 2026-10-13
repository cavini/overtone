/**
 * The mark: a fundamental and the overtones above it, dying away.
 *
 * Six arcs, each shorter, thinner and fainter than the one before. That is
 * what the word means — the harmonics sitting above a played note, each
 * quieter than the last — and it is what the app does, which is to find the
 * things running under what was actually said.
 *
 * Drawn rather than drafted as an image: it is six quadratic curves, it
 * scales to any size without a second file, and it takes its colour from
 * whatever it sits in.
 *
 * `aria-hidden`, because the word *Overtone* is always written beside it.
 * A screen reader that announced both would say the name twice.
 */
export function OvertoneMark({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 180 48"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ overflow: 'visible' }}
    >
      <g fill="none" stroke="var(--accent)" strokeLinecap="round">
        <path d="M4 44 Q 24 4 44 44" strokeWidth="2" opacity="1" />
        <path d="M48 44 Q 64 12 80 44" strokeWidth="1.6" opacity="0.72" />
        <path d="M84 44 Q 96 19 108 44" strokeWidth="1.3" opacity="0.52" />
        <path d="M112 44 Q 121 25 130 44" strokeWidth="1.1" opacity="0.36" />
        <path d="M134 44 Q 141 30 148 44" strokeWidth="1" opacity="0.24" />
        <path d="M152 44 Q 157 34 162 44" strokeWidth="1" opacity="0.15" />
      </g>
    </svg>
  )
}
