/**
 * A trash can, drawn rather than imported.
 *
 * Fourteen lines against a dependency and a build step for one glyph. It
 * inherits `currentColor`, so the button decides what colour it is, and
 * carries no label of its own — the button it sits in is what a screen
 * reader announces.
 */
export function TrashCan() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}
