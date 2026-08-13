import { expect, type Page } from "@playwright/test";

export type ResponsiveRole = "admin" | "coach";

export interface OverflowContext {
  role: ResponsiveRole;
  route: string;
  project: string;
  width?: number;
}

type OverflowProbe = {
  viewport: number;
  documentWidth: number;
  offenders: Array<{ selector: string; left: number; right: number; width: number }>;
};

function contextLabel(context: string | OverflowContext): string {
  if (typeof context === "string") return context;
  return [
    `role=${context.role}`,
    `route=${context.route}`,
    `project=${context.project}`,
    context.width === undefined ? null : `width=${context.width}`,
  ].filter(Boolean).join(", ");
}

export async function assertNoDocumentOverflow(
  page: Page,
  context: string | OverflowContext,
): Promise<void> {
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
    `${contextLabel(context)}: viewport=${result.viewport}, document=${result.documentWidth}, offenders=${JSON.stringify(result.offenders)}`,
  ).toBeLessThanOrEqual(result.viewport + 1);
}

export async function expectResponsiveRoute(
  page: Page,
  context: OverflowContext,
): Promise<void> {
  const response = await page.goto(context.route, { waitUntil: "domcontentloaded" });
  expect(
    response?.status() ?? 200,
    `${contextLabel(context)} returned an HTTP error`,
  ).toBeLessThan(400);
  await page.evaluate(() => document.fonts.ready);
  await expect(
    page.getByRole("heading", {
      name: /404|500|not found|could not be found|internal server error|application error/i,
    }),
    `${contextLabel(context)} rendered an error heading`,
  ).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute("data-mobile-responsive", "on");
  await assertNoDocumentOverflow(page, context);
}

export async function firstMatchingHref(
  page: Page,
  source: string,
  pattern: RegExp,
  label = pattern.toString(),
): Promise<string> {
  const response = await page.goto(source, { waitUntil: "domcontentloaded" });
  expect(response?.status() ?? 200, `${source} must load before discovering ${label}`).toBeLessThan(400);
  const hrefs = await page.locator("a[href]").evaluateAll((links) =>
    links
      .map((link) => link.getAttribute("href"))
      .filter((href): href is string => Boolean(href)),
  );
  const match = hrefs.find((href) => pattern.test(href));
  expect(match, `Expected ${source} to expose a populated ${label} link matching ${pattern}`).toBeTruthy();
  return match!;
}
