// US-039 · sharing one episode's stats by public link
//
// The one screen in the app a stranger ever sees, and nothing had ever
// opened it in a browser. Two faults had already shipped here: it rendered
// with no root layout at all — Next's placeholder, no CSS, the density
// strip coming out as a numbered list from 1 to 40 — and it was hardcoded
// to Portuguese, labels and `<html lang>` both.
//
// Seeded under a sentinel owner and deleted afterwards, so no real episode
// is ever given a public URL to make this pass.
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { episodes, series, seriesMembers } from '@overtone/db/schema'
import { expect, test } from '@playwright/test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { fitsOnAPhone } from './fits-on-a-phone.js'

const envFile = resolve(import.meta.dirname, '../../../.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env['DATABASE_URL'] ?? ''

/** An owner id no real account can have. */
const SENTINEL = '00000000-0000-0000-0000-00000000e2e1'

test.describe('a shared link', () => {
  test.skip(url.length === 0, 'needs DATABASE_URL')
  test.slow()

  const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} })
  const db = drizzle(client)
  let token = ''

  const clearUp = async (): Promise<void> => {
    await db.delete(seriesMembers).where(eq(seriesMembers.userId, SENTINEL))
    await db.delete(series).where(eq(series.ownerId, SENTINEL))
  }

  test.beforeAll(async () => {
    await clearUp()

    const [made] = await db
      .insert(series)
      .values({ ownerId: SENTINEL, title: 'Shared link walk' })
      .returning({ id: series.id })
    const seriesId = made?.id ?? ''
    await db.insert(seriesMembers).values({ seriesId, userId: SENTINEL, role: 'owner' })

    token = randomBytes(16).toString('hex')
    await db.insert(episodes).values({
      seriesId,
      number: 1,
      title: 'Sun Your Balls #999',
      status: 'ready',
      durationMs: 600_000,
      shareToken: token,
    })
  })

  test.afterAll(async () => {
    await clearUp()
    await client.end()
  })

  /*
   * The promise is that the page opens in the reader's language, and that
   * the numbers do not move when it does. The quotes are never translated —
   * they are what was said.
   */
  for (const { reader, lang, says } of [
    { reader: 'pt-BR', lang: 'pt-BR', says: /palavras contáveis|você está vendo/iu },
    { reader: 'en-GB', lang: 'en', says: /countable words|you are seeing/iu },
  ]) {
    test(`opens in the reader's language for ${reader}`, async ({ browser }) => {
      /*
       * Playwright's `locale` rather than an explicit accept-language
       * header: the context-level option sets that header *and*
       * navigator.language, and it wins over extraHTTPHeaders — so setting
       * the header alone left the config's pt-BR in place and the test
       * asserted nothing. It passed for pt and failed for en, which is what
       * gave it away.
       */
      const context = await browser.newContext({
        viewport: { width: 360, height: 740 },
        locale: reader,
        // No cookie: a stranger, which is the whole point of the link.
        storageState: { cookies: [], origins: [] },
      })
      const page = await context.newPage()

      await page.goto(`/s/${token}`)

      await expect(page.locator('h1')).toContainText('Sun Your Balls #999')

      // `lang` is what a screen reader uses to choose its pronunciation.
      await expect(page.locator('html')).toHaveAttribute('lang', lang)
      expect((await page.locator('main').textContent()) ?? '').toMatch(says)

      // It had no root layout at all once, so prove the stylesheet arrived.
      const styled = await page
        .locator('main')
        .evaluate((el) => getComputedStyle(el).maxWidth !== 'none')
      expect(styled, 'the shared page rendered unstyled').toBe(true)

      await fitsOnAPhone(page, `a shared link read in ${reader}`)

      await context.close()
    })
  }

  test('a made-up token is a 404, and says nothing about why', async ({ page }) => {
    const answered = await page.goto('/s/not-a-real-token-at-all')

    expect(answered?.status()).toBe(404)
    const said = ((await page.locator('body').textContent()) ?? '').toLowerCase()
    for (const leak of ['revoked', 'expired', 'revogado', 'library', 'biblioteca']) {
      expect(said, `the 404 mentioned ${leak}`).not.toContain(leak)
    }
  })
})
