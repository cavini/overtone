'use client'

import type { UiKey } from '../i18n/ui.js'

type Labels = Record<UiKey, string>

/**
 * Placeholder. The real one is being written separately.
 *
 * Renders nothing so the page is unaffected until it arrives.
 */
export function TranscriptView(_props: {
  readonly episodeId: string
  readonly labels: Labels
  readonly live: boolean
}) {
  return null
}
