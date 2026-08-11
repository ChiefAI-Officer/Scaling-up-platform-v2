#!/usr/bin/env tsx

/**
 * Synthetic-only visual acceptance captures for the universal invitation banner.
 * This file imports the pure email renderer directly; it never imports or invokes
 * notification, SMTP, database, or application-route code.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { chromium } from "playwright";
import {
  buildInvitationEmailHtml,
  buildInvitationEmailShell,
  renderCustomHtmlFragment,
  type InvitationCoachByline,
  type InvitationVars,
} from "../src/lib/assessments/invitation-email";

const outputDirectory = process.argv[2];
const coachImageUrl = "https://preview.invalid/coach.png";
const logoDataUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='36'%3E%3Crect width='180' height='36' fill='%23ffffff'/%3E%3Ctext x='4' y='25' font-family='Arial' font-size='22' font-weight='700' fill='%23522583'%3EScaling Up%3C/text%3E%3C/svg%3E";
const coachImagePng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+qgH9lwAAAABJRU5ErkJggg==", "base64");

type CaptureCase = {
  filename: string;
  label: string;
  viewport: { width: number; height: number };
  body: { kind: "markdown"; value: string } | { kind: "custom_html"; value: string };
  byline: InvitationCoachByline;
  imageBlocked?: boolean;
};

const vars: InvitationVars = {
  respondent: { firstName: "Avery", lastName: "Preview", email: "" },
  organizationName: "Synthetic preview organization",
  campaignName: "Sample leadership assessment",
  templateName: "Sample assessment",
  coachName: "Morgan Coach",
  invitationUrl: "https://preview.invalid/assessment/start",
  closeAt: new Date("2030-01-15T00:00:00.000Z"),
};

const cases: readonly CaptureCase[] = [
  { filename: "01-image-name-markdown-desktop.png", label: "Image + name / markdown / desktop", viewport: { width: 760, height: 900 }, body: { kind: "markdown", value: "Hi {{firstName}},\n\n**Your perspective matters.** Please complete the assessment." }, byline: { mode: "image_name", coachName: "Morgan Coach", coachImageUrl } },
  { filename: "02-name-only-markdown-desktop.png", label: "Name only / markdown / desktop", viewport: { width: 760, height: 900 }, body: { kind: "markdown", value: "Hi {{firstName}},\n\nYour input will help focus our next conversation." }, byline: { mode: "name_only", coachName: "Morgan Coach" } },
  { filename: "03-scaling-up-only-markdown-desktop.png", label: "Scaling Up only / markdown / desktop", viewport: { width: 760, height: 900 }, body: { kind: "markdown", value: "Hi {{firstName}},\n\nPlease share your assessment responses." }, byline: { mode: "scaling_up_only" } },
  { filename: "04-image-name-custom-html-desktop.png", label: "Image + name / custom HTML / desktop", viewport: { width: 760, height: 900 }, body: { kind: "custom_html", value: "<p>Hello {{firstName}},</p><p><strong>Bring your candid perspective</strong> to this assessment.</p>" }, byline: { mode: "image_name", coachName: "Morgan Coach", coachImageUrl } },
  { filename: "05-image-name-markdown-mobile.png", label: "Image + name / markdown / mobile", viewport: { width: 390, height: 844 }, body: { kind: "markdown", value: "Hi {{firstName}},\n\nPlease complete the assessment when you have a few minutes." }, byline: { mode: "image_name", coachName: "Morgan Coach", coachImageUrl } },
  { filename: "06-name-only-long-name-mobile.png", label: "Long name / markdown / mobile", viewport: { width: 390, height: 844 }, body: { kind: "markdown", value: "Hi {{firstName}},\n\nYour response is important." }, byline: { mode: "name_only", coachName: "Dr. Alexandria Penelope Montgomery-Smythe, Executive Leadership Coach" } },
  { filename: "07-image-blocked-desktop.png", label: "Image blocked / markdown / desktop", viewport: { width: 760, height: 900 }, body: { kind: "markdown", value: "Hi {{firstName}},\n\nThe banner remains readable when the coach image is unavailable." }, byline: { mode: "image_name", coachName: "Morgan Coach", coachImageUrl }, imageBlocked: true },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function renderEmail(capture: CaptureCase): string {
  if (capture.body.kind === "markdown") {
    return buildInvitationEmailHtml({ bodyMarkdown: capture.body.value, vars, chrome: "universalBanner", coachByline: capture.byline });
  }
  return buildInvitationEmailShell({
    bodyHtml: renderCustomHtmlFragment(capture.body.value, vars),
    vars,
    chrome: "universalBanner",
    coachByline: capture.byline,
  });
}

function documentFor(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#f3f4f6}body{padding:20px;box-sizing:border-box}</style></head><body>${html.replaceAll("cid:sulogo", logoDataUrl)}</body></html>`;
}

function manifestHtml(): string {
  const figures = cases.map(({ filename, label }) => `<figure><img src="${filename}" alt="${label}"><figcaption>${label}</figcaption></figure>`).join("\n");
  return `<!doctype html><html data-renderer="buildInvitationEmailShell"><head><meta charset="utf-8"><title>Invitation banner previews</title><style>body{font-family:Arial,sans-serif;margin:24px;background:#f3f4f6}figure{background:#fff;border:1px solid #ddd;padding:16px;margin:20px 0}img{max-width:100%;height:auto;display:block}figcaption{margin-top:10px} </style></head><body><h1>Universal invitation banner previews</h1><p>Renderer: buildInvitationEmailShell. Byline label: Your coach.</p>${figures}</body></html>`;
}

async function assertPng(path: string): Promise<void> {
  const bytes = await readFile(path);
  assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${path} is not PNG`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert(width > 0 && width <= 560, `${path} has unexpected width ${width}`);
  assert(height > 150 && height < 900, `${path} has unexpected height ${height}`);
}

async function main(): Promise<void> {
  assert(outputDirectory && isAbsolute(outputDirectory), "Usage: npm run capture:invitation-banner -- /absolute/output/directory");
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: true });

  const aliasInvariantHtml = buildInvitationEmailHtml({ bodyMarkdown: cases[0].body.value, vars: { ...vars, organizationName: "Different synthetic alias", showOrgLine: false }, chrome: "universalBanner", coachByline: cases[0].byline });
  assert(aliasInvariantHtml === renderEmail(cases[0]), "Universal banner must not vary by organization alias");

  const browser = await chromium.launch({ headless: true });
  try {
    for (const capture of cases) {
      const context = await browser.newContext({ viewport: capture.viewport, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.route(coachImageUrl, async (route) => {
        if (capture.imageBlocked) await route.abort();
        else await route.fulfill({ contentType: "image/png", body: coachImagePng });
      });
      const html = renderEmail(capture);
      assert(!html.includes("data-organization"), `${capture.filename} contains an organization banner marker`);
      await page.setContent(documentFor(html), { waitUntil: "load" });
      const root = page.locator("body > div").first();
      await root.waitFor({ state: "visible" });
      const rootBounds = await root.boundingBox();
      assert(rootBounds && rootBounds.width <= capture.viewport.width - 40, `${capture.filename} exceeds its viewport`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert(!overflow, `${capture.filename} has horizontal overflow`);
      await assert(root.getByRole("link", { name: "Start the assessment" }).count(), `${capture.filename} is missing CTA`);
      await assert(root.getByText("If the button doesn't work", { exact: false }).count(), `${capture.filename} is missing fallback`);
      await assert(root.getByText("Scaling Up Platform", { exact: false }).count(), `${capture.filename} is missing footer`);
      const byline = root.locator("[data-invitation-coach-byline]");
      await assert((await byline.count()) === (capture.byline.mode === "scaling_up_only" ? 0 : 1), `${capture.filename} has wrong byline state`);
      await root.screenshot({ path: join(output, capture.filename), type: "png", animations: "disabled" });
      await assertPng(join(output, capture.filename));
      await context.close();
    }
  } finally {
    await browser.close();
  }
  await writeFile(join(output, "index.html"), manifestHtml(), "utf8");
}

main().catch((error) => {
  console.error("Invitation banner preview capture failed:", error);
  process.exitCode = 1;
});
