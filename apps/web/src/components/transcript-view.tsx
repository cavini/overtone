'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { UiKey } from '../i18n/ui.js'
import {
  REVEAL_TICK_MS,
  revealAfterTick,
  totalChars,
  visibleParts,
} from '../presenter/transcript-reveal.js'
import type { TranscriptPart, TranscriptSoFar } from '../presenter/transcript-text.js'

type Labels = Record<UiKey, string>

/**
 * How often to ask whether another chunk has landed.
 *
 * A chunk is twelve minutes of audio paced against a refilling allowance
 * (ADR 0020), so one arrives every few minutes at best — asking every second
 * would be hundreds of requests to report that nothing had happened. Five
 * seconds is already far finer than the thing it is watching.
 */
const POLL_MS = 5_000

/** Close enough to the bottom to count as reading the newest text. */
const FOLLOW_SLACK_PX = 64

/**
 * Whether this reader has asked for less movement.
 *
 * The stylesheet's global rule flattens CSS animation and transition, which
 * is most of the app — but the reveal below is a timer, and no stylesheet can
 * switch that off. So it is asked here as well, and with reduced motion the
 * text simply appears.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/**
 * What has been transcribed so far, while the rest is still going.
 *
 * An episode of this show is longer than a whole hourly allowance, so it is
 * cut into chunks and transcribed one at a time over the best part of an
 * hour (ADR 0020). The page showed how far along that was and not one word
 * of it, which left nothing to do but watch a progress bar — while the thing
 * the reader actually wanted was already sitting in the database.
 *
 * Collapsible, because the finished page is about counts and this is a
 * twenty-thousand-word aside to them.
 */
export function TranscriptView({
  episodeId,
  labels,
  live,
  focusChunk,
}: {
  readonly episodeId: string
  readonly labels: Labels
  readonly live: boolean
  /**
   * Scroll to this part once it is on screen.
   *
   * Set when arriving from a search result, so clicking a moment lands in
   * the script at roughly where it was said rather than at the top of a
   * two-hour transcript.
   */
  readonly focusChunk?: number
}) {
  const bodyId = useId()
  const reduced = usePrefersReducedMotion()

  /*
   * Open, always.
   *
   * It used to open only while transcription was still running, which meant
   * that for every episode already finished — which is most of them, most
   * of the time — the transcript was a button somebody had to find. The
   * words are the thing this product is for. They do not go behind a click.
   */
  const [open, setOpen] = useState(true)
  const [parts, setParts] = useState<readonly TranscriptPart[]>([])
  const [revealed, setRevealed] = useState(0)

  // The cursor never reaches the page, so it is not state. Keeping it out of
  // the render also keeps it out of the polling effect's dependencies, which
  // would otherwise restart the interval on every answer.
  const cursor = useRef(0)
  const fetching = useRef(false)
  const scroller = useRef<HTMLDivElement>(null)
  // Follow the newest text only while the reader is already at the bottom.
  const following = useRef(true)

  const total = totalChars(parts)
  /*
   * Typed out whether or not transcription is still running.
   *
   * This used to animate only a live episode, on the reasoning that the
   * reveal signals progress. In practice a short file finishes in seconds
   * and a reopened page is never live, so the effect essentially never ran
   * — the transcript simply appeared, all at once, which is the one thing
   * it was built not to do.
   *
   * Reduced motion still turns it off, and the reveal paces off the backlog
   * so a long transcript fills quickly rather than crawling.
   */
  const typing = !reduced
  const caughtUp = revealed >= total

  // A second upload reuses this component with a different episode. Without
  // this, its first chunk is appended to the last episode's transcript.
  useEffect(() => {
    cursor.current = 0
    following.current = true
    setParts([])
    setRevealed(0)
  }, [episodeId])

  /*
   * Asks for what it does not already have.
   *
   * One request on opening, then every few seconds while there is more to
   * come. `live` turning false is itself a reason to ask again: that is the
   * moment the last chunk has landed, and without a final look the episode
   * would finish a chunk short on screen.
   */
  useEffect(() => {
    if (!open) return

    let stopped = false

    const pull = async (): Promise<void> => {
      // An answer slower than the interval would otherwise be asked for
      // twice from the same cursor, and arrive twice on the page.
      if (fetching.current) return
      fetching.current = true

      try {
        const response = await fetch(
          `/api/episodes/transcript?episodeId=${encodeURIComponent(episodeId)}&from=${cursor.current}`,
        ).catch(() => undefined)

        if (stopped || response === undefined || !response.ok) return

        const payload = (await response.json()) as Partial<TranscriptSoFar>
        if (stopped) return

        const arrived = payload.parts ?? []
        cursor.current = payload.nextFrom ?? cursor.current
        if (arrived.length > 0) setParts((held) => [...held, ...arrived])
      } finally {
        fetching.current = false
      }
    }

    void pull()

    const timer = live ? setInterval(() => void pull(), POLL_MS) : undefined

    return () => {
      stopped = true
      // An answer arriving after this is thrown away, so the next run has to
      // be free to ask for the same thing again.
      fetching.current = false
      if (timer !== undefined) clearInterval(timer)
    }
  }, [episodeId, live, open])

  /*
   * Lets the words out.
   *
   * Only while the episode is still being transcribed. Once it is finished
   * nothing more is coming, so typing out an hour of talking would just be
   * standing between the reader and a transcript that is entirely there.
   */
  useEffect(() => {
    if (!open) return

    if (!typing) {
      setRevealed(total)
      return
    }

    if (caughtUp) return

    const timer = setInterval(() => {
      setRevealed((shown) => revealAfterTick(shown, total))
    }, REVEAL_TICK_MS)

    return () => clearInterval(timer)
  }, [open, typing, total, caughtUp])

  // Keeps the newest words in view, unless the reader has gone back up to
  // read something — being yanked away mid-sentence is worse than having to
  // scroll.
  useEffect(() => {
    const node = scroller.current
    if (node === null || !live || !following.current) return

    node.scrollTop = node.scrollHeight
  }, [revealed, live])

  const shown = visibleParts(parts, revealed)

  /*
   * Jump to the part a search result pointed at.
   *
   * Runs when the part arrives rather than when the request does: the
   * transcript is fetched after mount, so at the moment of the click there
   * is nothing on screen to scroll to yet.
   */
  useEffect(() => {
    if (focusChunk === undefined || !open) return

    const node = scroller.current?.querySelector(`[data-chunk="${focusChunk}"]`)
    if (!(node instanceof HTMLElement)) return

    // Stop following the newest text, or the jump is undone on the next tick.
    following.current = false
    node.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
  }, [focusChunk, open, parts, reduced])

  return (
    <section
      className="mt-6 rounded-xl border p-5"
      style={{ borderColor: 'var(--edge)', background: 'var(--panel)' }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl" style={{ fontFamily: 'var(--font-display)' }}>
          {labels.transcriptHeading}
        </h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => {
            // Opening shows what is already there rather than replaying it.
            // The reveal is for words arriving now, not for a transcript the
            // reader has been waiting to see.
            if (!open) setRevealed(totalChars(parts))
            setOpen(!open)
          }}
          className="rounded-md border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: 'var(--edge)', color: 'var(--prose)' }}
        >
          {open ? labels.transcriptHide : labels.transcriptShow}
        </button>
      </div>

      {live ? (
        <p className="mt-1 text-sm" style={{ color: 'var(--quiet)' }}>
          {labels.transcriptLive}
        </p>
      ) : null}

      {open ? (
        <div id={bodyId}>
          {total === 0 ? (
            <p className="mt-4 text-sm" style={{ color: 'var(--quiet)' }}>
              {labels.transcriptEmpty}
            </p>
          ) : (
            /*
             * Deliberately not a live region. It reaches twenty thousand
             * words, and announcing every arrival would read the episode
             * aloud over whatever else the reader was doing.
             */
            <div
              ref={scroller}
              onScroll={(event) => {
                const node = event.currentTarget
                following.current =
                  node.scrollHeight - node.scrollTop - node.clientHeight < FOLLOW_SLACK_PX
              }}
              className="mt-4 max-h-96 overflow-y-auto"
            >
              {shown.map((part, position) => (
                <p
                  key={part.index}
                  data-chunk={part.index}
                  className="mb-3 text-sm leading-relaxed"
                  style={{ color: 'var(--prose)' }}
                >
                  {part.text}
                  {typing && !caughtUp && position === shown.length - 1 ? <Caret /> : null}
                </p>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}

/** Where the words are coming out. Flattened by the reduced-motion rule. */
function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse align-text-bottom"
      style={{ background: 'var(--accent)' }}
    />
  )
}
