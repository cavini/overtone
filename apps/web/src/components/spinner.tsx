/**
 * Something is happening, and it will not take long enough to read about.
 *
 * The library row used to say "Lendo" on the open episode and "Ler" on the
 * others — which was meant as *you are reading this one*, and read as *the
 * app is reading it*, on an episode that finished hours ago. A word that
 * has to be explained is worse than no word.
 *
 * So: nothing at all when there is nothing happening, and this while an
 * episode is still being transcribed.
 *
 * `prefers-reduced-motion` stops the spin and leaves the ring, because the
 * ring is the message and the motion is only how it is usually delivered.
 */
export function Spinner({ label }: { readonly label: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 motion-reduce:animate-none"
      style={{ borderColor: 'var(--accent-quiet)', borderTopColor: 'transparent' }}
    />
  )
}
