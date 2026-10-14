import type { FeedEpisode } from '@overtone/core'

/**
 * Reading somebody else's XML, in one place.
 *
 * Two questions are asked of a feed — what is episode 42 called, and what is
 * in here — and they used to be one function because only the first existed.
 * The parsing is the part that must not be duplicated: which item belongs to
 * which show, and what number it is, are decided by regexes over titles, and
 * a second copy of that would answer differently the first time either was
 * touched. One show in this feed changed its own capitalisation halfway
 * through its run; a drifted copy would silently stop recognising half of it.
 *
 * A regex rather than an XML parser because a feed is flat, this reads six
 * fields out of it, and the alternative is a dependency.
 */

/** Between the markers, with CDATA unwrapped. */
function between(xml: string, tag: string): string | undefined {
  const match = new RegExp(
    `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
    'u',
  ).exec(xml)

  return match?.[1]
}

/** Show notes are HTML. The product deals in text. */
function asPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/p>/giu, '\n\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

/**
 * An attribute of the first matching tag in an item.
 *
 * `&amp;` is unescaped because that is how XML spells `&`, and an enclosure
 * URL with query parameters is full of them. Left escaped the URL is a 404 —
 * and on a private feed the token lives in exactly that part of it.
 */
function attributeOf(item: string, tag: string, name: string): string {
  const opening = new RegExp(`<${tag}\\b[^>]*>`, 'iu').exec(item)?.[0] ?? ''

  return new RegExp(`${name}="([^"]*)"`, 'iu').exec(opening)?.[1]?.replace(/&amp;/gu, '&') ?? ''
}

/**
 * Which episode an item is.
 *
 * `itunes:episode` when the publisher sets it, which is the only reliable
 * answer. Failing that, a number in the title — podcasts overwhelmingly put
 * it there, and a feed without either cannot be matched at all.
 */
function numberOf(item: string): number | undefined {
  const tagged = between(item, 'itunes:episode')
  if (tagged !== undefined && /^\d+$/u.test(tagged.trim())) return Number(tagged.trim())

  const title = between(item, 'title') ?? ''
  const inTitle = /#?(\d{1,4})\b/u.exec(title)

  return inTitle?.[1] === undefined ? undefined : Number(inTitle[1])
}

/**
 * Every numbered item of one show, by episode number.
 *
 * `show` matched against the start of the title, case-insensitively: a
 * collective publishes every programme it makes from one account, so a
 * single feed holds several shows, and since almost nobody sets
 * `itunes:episode` the number is read from the title where the shows
 * collide. One real feed has nine numbers claimed by two or more
 * programmes. Absent means every item counts, which is right for a feed
 * with one show in it.
 */
export function readFeedItems(xml: string, show?: string): Map<number, FeedEpisode> {
  const wanted = show?.trim().toLowerCase()
  const episodes = new Map<number, FeedEpisode>()

  for (const [item] of xml.matchAll(/<item\b[\s\S]*?<\/item>/gu)) {
    const number = numberOf(item)
    if (number === undefined) continue

    const title = asPlainText(between(item, 'title') ?? '')

    // Another programme in the same feed. Skipped before the first-wins
    // check below, because otherwise it claims the number and the episode
    // we are actually looking for is the one discarded.
    if (wanted !== undefined && !title.trim().toLowerCase().startsWith(wanted)) continue

    // First wins. A feed lists newest first, and a re-release of an old
    // number should not overwrite the episode everybody means.
    if (episodes.has(number)) continue

    episodes.set(number, {
      number,
      title,
      description: asPlainText(
        between(item, 'content:encoded') ?? between(item, 'description') ?? '',
      ),
      audioUrl: attributeOf(item, 'enclosure', 'url'),
      audioBytes: Number(attributeOf(item, 'enclosure', 'length')) || 0,
    })
  }

  return episodes
}
