/**
 * Orders anything countable: most frequent first, ties broken by label.
 *
 * Ties are broken by code unit rather than by locale collation. `Intl.Collator`
 * would order accented labels the way a Portuguese reader expects, but its
 * output depends on the ICU version bundled with the runtime — so the same
 * episode could rank two equal entries differently on two machines. Counts
 * must be reproducible, so ordering here is mechanical, and locale-aware
 * sorting for display belongs to the presenter.
 */
export function compareByCountThenLabel(
  a: { readonly count: number; readonly label: string },
  b: { readonly count: number; readonly label: string },
): number {
  if (b.count !== a.count) return b.count - a.count
  if (a.label < b.label) return -1
  if (a.label > b.label) return 1
  return 0
}
