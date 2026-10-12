// Nothing had ever checked whether the app is usable without a mouse or
// with a screen reader. These are the unambiguous ones — a control with no
// name is read out as "button", which is the same as not being labelled.
import { expect, test } from '@playwright/test'

const PAGES = ['/pt', '/en', '/pt/entrar', '/pt/creditos'] as const

test.describe('usable without a mouse or a screen', () => {
  for (const path of PAGES) {
    test(`every control on ${path} has a name`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      const nameless = await page
        .locator('button, a, input:not([type="hidden"]), select, textarea')
        .evaluateAll((els) =>
          els
            .filter((el) => {
              const box = el.getBoundingClientRect()
              if (box.width === 0 && box.height === 0) return false

              const forId =
                el.id.length > 0
                  ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent
                  : undefined

              // Everything a browser will turn into an accessible name.
              const named = [
                el.getAttribute('aria-label'),
                el.getAttribute('aria-labelledby'),
                el.getAttribute('title'),
                el.textContent,
                forId,
                el.closest('label')?.textContent,
                el.getAttribute('placeholder'),
              ].some((source) => (source ?? '').trim().length > 0)

              return !named
            })
            .map((el) => el.outerHTML.slice(0, 120)),
        )

      expect(nameless, 'controls a screen reader cannot announce').toEqual([])
    })

    test(`${path} has one h1 and no skipped heading level`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      const levels = await page
        .locator('h1, h2, h3, h4, h5, h6')
        .evaluateAll((els) =>
          els
            .filter((el) => el.getBoundingClientRect().height > 0)
            .map((el) => ({ level: Number(el.tagName[1]), text: (el.textContent ?? '').trim().slice(0, 30) })),
        )

      expect(levels.filter(({ level }) => level === 1), 'not exactly one h1').toHaveLength(1)

      const skips = levels
        .slice(1)
        .map((heading, at) => ({ from: levels[at]?.level ?? 1, ...heading }))
        .filter(({ from, level }) => level > from + 1)
      expect(skips, 'a heading level was skipped').toEqual([])
    })

    test(`${path} shows where the keyboard is`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      await page.keyboard.press('Tab')

      const visible = await page.evaluate(() => {
        const on = document.activeElement
        if (on === null || on === document.body) return 'nothing took focus'
        const style = getComputedStyle(on)
        const ring =
          style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
        const shadow = style.boxShadow !== 'none'
        return ring || shadow ? '' : `${on.tagName.toLowerCase()} focuses invisibly`
      })

      expect(visible).toBe('')
    })
  }
})
