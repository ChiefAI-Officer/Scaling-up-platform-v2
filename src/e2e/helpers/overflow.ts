import { expect, type Page } from "@playwright/test";

type OverflowProbe = {
  viewport: number;
  documentWidth: number;
  offenders: Array<{ selector: string; left: number; right: number; width: number }>;
};

export async function assertNoDocumentOverflow(page: Page, label: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate<OverflowProbe>(() => {
    const viewport = document.documentElement.clientWidth;
    const selectorFor = (element: Element) => {
      const id = element.id ? `#${element.id}` : "";
      const classes = [...element.classList].slice(0, 3).map((name) => `.${name}`).join("");
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };
    const offenders = [...document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { selector: selectorFor(element), left: rect.left, right: rect.right, width: rect.width };
      })
      .filter((item) => item.left < -1 || item.right > viewport + 1)
      .sort((a, b) => b.width - a.width)
      .slice(0, 10);
    return {
      viewport,
      documentWidth: document.documentElement.scrollWidth,
      offenders,
    };
  });

  expect(
    result.documentWidth,
    `${label}: viewport=${result.viewport}, document=${result.documentWidth}, offenders=${JSON.stringify(result.offenders)}`,
  ).toBeLessThanOrEqual(result.viewport + 1);
}
