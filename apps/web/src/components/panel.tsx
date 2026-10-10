'use client'

import { useId, useState, type ReactNode } from 'react'

/**
 * The frame every block on the page sits in, and folds away into.
 *
 * Four panels had copied the same box out of each other, the top margin
 * included — and a margin is a panel stating its distance from a neighbour
 * it cannot see. It held up until one copy was missing it: the upload form
 * had none, so it sat flush against the running jokes above. The space
 * between two panels belongs to whatever is stacking them, so there is none
 * here.
 *
 * Folding is the other half of the same problem. Five blocks on one column
 * is a lot of page to get past, and most of them are tools: you upload three
 * times a week, you set a running joke up once. Which ones start folded is
 * the caller's call, because only the caller knows whether its panel is
 * something to read or something to operate.
 */
export function Panel({
  heading,
  startOpen = true,
  children,
}: {
  readonly heading: string
  /** Folded blocks are the ones you reach for, not the ones you read. */
  readonly startOpen?: boolean
  readonly children: ReactNode
}) {
  const bodyId = useId()
  const [open, setOpen] = useState(startOpen)

  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--edge)', background: 'var(--panel)' }}
    >
      {/*
       * The button is inside the heading rather than beside it, which keeps
       * the heading a heading — something to jump between — while making the
       * whole width of it the thing you press. On a phone that matters more
       * than it looks: a chevron on its own is a 16px target.
       */}
      <h2 className="text-xl" style={{ fontFamily: 'var(--font-display)' }}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between gap-3 py-1 text-left"
        >
          <span style={{ textWrap: 'balance' }}>{heading}</span>
          <Chevron open={open} />
        </button>
      </h2>

      {/*
       * Hidden, never unmounted.
       *
       * Folding the upload away must not stop the upload: the form is what
       * drives an episode through transcription for the best part of an
       * hour, and unmounting it would abandon the episode and lose the
       * resume that gets it back. `hidden` leaves everything running and
       * takes the panel out of the page for anyone reading it aloud.
       */}
      <div id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  )
}

/** Points down at the panel it has opened. Flattened by the reduced-motion rule. */
function Chevron({ open }: { readonly open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 transition-transform"
      style={{ color: 'var(--quiet)', transform: open ? 'rotate(90deg)' : 'none' }}
    >
      <path d="M5.5 3 10.5 8 5.5 13" />
    </svg>
  )
}
