import { expect, type Page } from '@playwright/test'

/** Something laid out wider than the screen, and what it was. */
export interface Overhang {
  readonly what: string
  readonly width: number
  readonly right: number
  readonly text: string
}

/*
 * Found by measuring the page, not by looking at a picture of it.
 *
 * A screenshot shows a row running off the side only if you happen to look
 * at the right one; this asks every element where it ends. The tolerance is
 * one pixel, for sub-pixel rounding at fractional device ratios.
 *
 * `overflow-x: auto` containers are excluded deliberately — a wide table
 * scrolling inside its own box is the fix, not the bug. What is being
 * caught is content pushing the *page* sideways.
 */
export const overhangs = async (page: Page): Promise<Overhang[]> =>
  page.evaluate(() => {
    const limit = document.documentElement.clientWidth + 1

    const scrollsItself = (el: Element): boolean => {
      for (let at: Element | null = el; at !== null; at = at.parentElement) {
        const { overflowX } = getComputedStyle(at)
        if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden') return true
      }
      return false
    }

    const name = (el: Element): string => {
      const classes =
        typeof el.className === 'string' && el.className.trim().length > 0
          ? `.${el.className.trim().split(/\s+/).slice(0, 4).join('.')}`
          : ''
      return `${el.tagName.toLowerCase()}${classes}`
    }

    return [...document.body.querySelectorAll('*')]
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ el, box }) => box.width > 0 && box.right > limit && !scrollsItself(el))
      .map(({ el, box }) => ({
        what: name(el),
        width: Math.round(box.width),
        right: Math.round(box.right),
        text: (el.textContent ?? '').trim().slice(0, 60),
      }))
  })

/** Whether the page itself can be dragged sideways. */
export const scrollsSideways = async (page: Page): Promise<boolean> =>
  page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )

/**
 * The assertion every screen gets.
 *
 * Both halves are needed. An element can hang over the edge while the page
 * does not scroll, because an ancestor clips it — the text is still cut off
 * and unreachable. And the page can scroll with no single element over the
 * edge, when a gap or a margin does it.
 */
export const fitsOnAPhone = async (page: Page, where: string): Promise<void> => {
  const over = await overhangs(page)

  expect(over, `${where} lays content past the right edge:\n${JSON.stringify(over, null, 2)}`).toEqual(
    [],
  )
  expect(await scrollsSideways(page), `${where} scrolls sideways`).toBe(false)
}

/**
 * Nothing squeezed below the width its own words need.
 *
 * Overflow is not the only way a phone layout fails, and it was not how the
 * library row failed: the row did not spill, it *compressed*, handing the
 * episode title 24 px and wrapping it one character per line. Readable text
 * in an unreadable column.
 *
 * So the measure is relative, not a fixed pixel floor — a 25 px box holding
 * the word "Sair" is correct, and a first attempt at this check flagged it.
 * The question is whether the box is narrower than the longest word in it
 * can be drawn, which is the point where the browser starts breaking words
 * mid-syllable. Measured with the element's own computed font, so it is the
 * real width rather than an estimate.
 */
export const nothingCrushed = async (page: Page, selector: string): Promise<void> => {
  const crushed = await page.locator(selector).evaluateAll((els) => {
    const ruler = document.createElement('canvas').getContext('2d')
    if (ruler === null) return []

    return els
      .map((el) => {
        const style = getComputedStyle(el)
        ruler.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`

        const text = (el.textContent ?? '').trim()
        const widest = text
          .split(/\s+/u)
          .reduce((worst, word) => Math.max(worst, ruler.measureText(word).width), 0)

        // The content box, which is what the text actually gets.
        const room =
          el.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)

        return { text, widest, room }
      })
      .filter(({ text, widest, room }) => text.length > 0 && room > 0 && widest > room + 1)
      .map(
        ({ text, widest, room }) =>
          `${text.slice(0, 40)} — ${String(Math.round(room))}px of room for a ${String(Math.round(widest))}px word`,
      )
  })

  expect(crushed, 'squeezed narrower than their own words').toEqual([])
}
