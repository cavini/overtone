/**
 * Lists or downloads episodes from a podcast RSS feed.
 *
 * Every feed item carries an `<enclosure>` pointing at its audio file — that
 * is what podcast apps read, and it is a plain HTTP download.
 *
 *   pnpm fetch:episode <feed-url>            # list what is in the feed
 *   pnpm fetch:episode <feed-url> 1          # download episode 1 from the list
 *
 * Downloads land in ./audio, which is gitignored: a two-hour episode is tens
 * of megabytes and has no business in git history.
 */
import { createWriteStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const [feedUrl, wanted] = process.argv.slice(2)

if (feedUrl === undefined) {
  console.error('Usage: pnpm fetch:episode <feed-url> [number]')
  process.exit(1)
}

interface Episode {
  readonly title: string
  readonly published: string
  readonly url: string
  readonly bytes: number
  readonly type: string
}

const between = (xml: string, tag: string): string => {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml)
  return (match?.[1] ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .trim()
}

const attribute = (xml: string, name: string): string =>
  new RegExp(`${name}="([^"]*)"`, 'i').exec(xml)?.[1]?.replace(/&amp;/g, '&') ?? ''

const megabytes = (bytes: number): string =>
  bytes > 0 ? `${(bytes / 1024 / 1024).toFixed(0)} MB` : '?'

console.log(`reading ${feedUrl}`)
const response = await fetch(feedUrl, {
  headers: { 'user-agent': 'overtone/0.1 (podcast analytics, personal use)' },
})

if (!response.ok) {
  console.error(`feed returned ${response.status} ${response.statusText}`)
  process.exit(1)
}

const xml = await response.text()

const episodes: Episode[] = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)]
  .map(([item]) => {
    const enclosure = /<enclosure[^>]*>/i.exec(item)?.[0] ?? ''
    return {
      title: between(item, 'title') || '(untitled)',
      published: between(item, 'pubDate').slice(0, 16),
      url: attribute(enclosure, 'url'),
      bytes: Number(attribute(enclosure, 'length')) || 0,
      type: attribute(enclosure, 'type'),
    }
  })
  .filter((episode) => episode.url.length > 0)

if (episodes.length === 0) {
  console.error('no episodes with an <enclosure> found — is this a podcast feed?')
  process.exit(1)
}

console.log(`\n  ${between(xml, 'title')} — ${episodes.length} episodes\n`)

if (wanted === undefined) {
  episodes.slice(0, 20).forEach((episode, index) => {
    console.log(`  ${String(index + 1).padStart(3)}. ${episode.title.slice(0, 58).padEnd(58)} ${megabytes(episode.bytes).padStart(7)}  ${episode.published}`)
  })
  console.log(`\n  Download one with:  pnpm fetch:episode "${feedUrl}" 1`)
  process.exit(0)
}

const episode = episodes[Number(wanted) - 1]
if (episode === undefined) {
  console.error(`there is no episode ${wanted}; the feed has ${episodes.length}`)
  process.exit(1)
}

const extension = episode.url.split('?')[0]?.split('.').pop() ?? 'mp3'
const safeTitle = episode.title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-').slice(0, 50)
const outDir = resolve(import.meta.dirname ?? '.', '../audio')
const outPath = resolve(outDir, `${safeTitle}.${extension}`)

await mkdir(outDir, { recursive: true })
console.log(`  downloading "${episode.title}"`)
console.log(`  from ${episode.url.slice(0, 80)}…`)

const audio = await fetch(episode.url, {
  headers: { 'user-agent': 'overtone/0.1 (podcast analytics, personal use)' },
})

if (!audio.ok || audio.body === null) {
  console.error(`  download failed: ${audio.status} ${audio.statusText}`)
  process.exit(1)
}

await pipeline(Readable.fromWeb(audio.body), createWriteStream(outPath))

const { size } = await stat(outPath)
console.log(`\n  saved ${megabytes(size)} to ${outPath}`)
