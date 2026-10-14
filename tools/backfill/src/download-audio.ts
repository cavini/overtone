import type { StartProgram } from './spawn-program.js'

/**
 * Pulls one episode's audio onto disk.
 *
 * **With curl rather than `fetch`, and that is not a preference.** Captivate's
 * CDN answers `fetch` with a 404 and curl with the redirect it should —
 * identical URL, identical method, and no combination of user-agent, accept
 * or accept-encoding headers changes it, so the difference is below the
 * header layer. Podcast hosts sit behind CDNs that do this sort of thing.
 * The feed itself is fetched normally; only the media download needs this.
 *
 * curl also ships with macOS, follows redirects, retries, and writes
 * straight to a file — which matters at a hundred megabytes an episode,
 * because nothing here should hold one in memory to then write it out.
 */

/**
 * Enough for a host having a bad minute, not enough to hide one that is
 * down. The run is days long; a download that cannot happen should say so
 * and let the next episode be tried.
 */
const RETRIES = 3

export async function downloadAudio(
  url: string,
  toPath: string,
  start: StartProgram,
): Promise<void> {
  const program = start('curl', [
    // A podcast enclosure is a redirect to a CDN, every time.
    '--location',
    /*
     * Without this, curl writes the host's error page into the output file
     * and exits 0 — and what reaches the decoder is a few hundred bytes of
     * HTML named like an episode.
     */
    '--fail',
    '--retry',
    String(RETRIES),
    '--silent',
    // Silent swallows the reason as well as the progress bar. This puts the
    // reason back, which is the only clue a failure leaves.
    '--show-error',
    '--output',
    toPath,
    url,
  ])

  let end
  try {
    end = await program.done
  } catch (error) {
    throw new Error(`could not run curl to download ${url}: ${String(error)}`)
  }

  if (end.code !== 0) {
    throw new Error(`could not download ${url}: ${end.stderr || `curl exited ${String(end.code)}`}`)
  }
}
