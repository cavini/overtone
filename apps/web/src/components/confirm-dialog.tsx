'use client'

import { useEffect, useRef } from 'react'

/**
 * A small modal that asks before something irreversible happens.
 *
 * The native `<dialog>` rather than a div with a high z-index: it traps
 * focus, closes on Escape, renders in the top layer above everything
 * whatever the stacking context says, and makes the rest of the page inert
 * — four things that are tedious to do correctly by hand and easy to do
 * half of.
 *
 * Not `window.confirm`, which blocks the whole tab, cannot be styled, and
 * says the site's domain name where the episode's title should be.
 */
export function ConfirmDialog({
  open,
  question,
  confirm,
  cancel,
  onConfirm,
  onCancel,
}: {
  readonly open: boolean
  /** What is about to happen, naming the thing it happens to. */
  readonly question: string
  readonly confirm: string
  readonly cancel: string
  readonly onConfirm: () => void
  readonly onCancel: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    if (element === null) return

    // `showModal` rather than the `open` attribute: only the former puts it
    // in the top layer and makes the rest of the page inert.
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      // Escape closes it without going through either button, and the
      // caller's state has to hear about that or the dialog cannot be
      // reopened.
      onClose={onCancel}
      // A click on the backdrop lands on the dialog element itself; one on
      // the content lands on a child. Cancelling on the former is the
      // convention and costs nothing, because cancelling is the safe answer.
      onClick={(event) => {
        if (event.target === dialog.current) onCancel()
      }}
      /*
       * `m-auto` restores what a `<dialog>` does on its own. The browser
       * centres a modal with `margin: auto`, and Tailwind's reset sets
       * `margin: 0` on everything — so without this it sits in the top-left
       * corner, which is where it sat.
       */
      className="m-auto max-w-sm rounded-xl border p-5 backdrop:bg-black/40"
      style={{ borderColor: 'var(--edge)', background: 'var(--panel)', color: 'var(--prose)' }}
    >
      <p className="text-sm">{question}</p>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-2 text-sm"
          style={{ color: 'var(--quiet)' }}
        >
          {cancel}
        </button>
        {/*
          * The dangerous one is not the default. Focus lands on cancel, so
          * Enter on a dialog somebody did not read keeps the episode.
          */}
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md px-3 py-2 text-sm font-medium"
          style={{ background: 'var(--danger)', color: '#fff' }}
        >
          {confirm}
        </button>
      </div>
    </dialog>
  )
}
