import { test, expect, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { campaignId, adminCampaignId, adminSourceSuffix, sourceCampaignId, unsupportedCampaignId, proofPassword, startSummaryProof } from "./fixtures/summary-reporting";

// Mutations only reach the fixture-owned loopback database/server. Real UI,
// NextAuth, route handlers, authorization, Prisma, snapshot builder, renderer,
// SDK wrapper and audits. Blob transport is simulated; limiter is development.
test.describe.configure({ mode: "serial" });
let proof: Awaited<ReturnType<typeof startSummaryProof>>;
// Test runs never overwrite reviewed, committed visual evidence. Promote only
// the exact output files inspected after the run into docs/research/evidence.
const evidence = join(process.cwd(), "test-results", "summary-reporting-evidence");
const api = `/api/assessment-campaigns/${campaignId}/summary-reports`;
const sourceOrder = [
  { submissionId: "proof-s-ceo", sourceCampaignId: campaignId, role: "CEO", position: 0 },
  { submissionId: "proof-s-ed", sourceCampaignId: campaignId, role: "TEAM", position: 0 },
  { submissionId: "proof-s-dee", sourceCampaignId: campaignId, role: "TEAM", position: 1 },
];
let reportId: string;
let checksum: string;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  mkdirSync(evidence, { recursive: true });
  proof = await startSummaryProof();
});
test.afterAll(async () => { if (proof) await proof.stop(); });

async function login(page: Page, role: "coach" | "admin") {
  await page.route(/^https?:\/\//, (route) => new URL(route.request().url()).host === new URL(proof.baseURL).host ? route.continue() : route.abort());
  await page.goto(`${proof.baseURL}/login`);
  await page.getByLabel("Email", { exact: true }).fill(`${role}@summary-proof.example`);
  await page.getByLabel("Password", { exact: true }).fill(proofPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
function host(role: "coach" | "admin", id = campaignId) {
  return `${proof.baseURL}/${role === "coach" ? "portal/assessments" : "admin/assessments/campaigns"}/${id}`;
}
async function screenshots(page: Page, state: string, nativePdf = false) {
  for (const [size, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    if (nativePdf) {
      // Resize/foreground changes invalidate native PDF compositing. Settle
      // AFTER the final viewport, and avoid fullPage's implicit enlargement.
      await page.bringToFront();
      await page.waitForTimeout(3000);
    }
    await page.screenshot({ path: join(evidence, `${state}-${size}.png`), fullPage: !nativePdf, animations: "disabled" });
    if (size === "mobile") await page.screenshot({ path: join(evidence, `${state}-mobile-viewport.png`), animations: "disabled" });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

test("coach/admin share one real catalog; compose, reorder, double-create and freeze one report", async ({ page, browser }) => {
  await login(page, "coach");
  await page.goto(host("coach"));
  expect((await page.request.get(`${proof.baseURL}/login`)).headers()["x-frame-options"]).toBe("DENY");
  await expect(page.getByText("No summary reports yet.")).toBeVisible();
  await screenshots(page, "coach-empty");
  await page.getByRole("button", { name: "Open Wizard" }).click();
  const catalog = await page.getByRole("dialog").getByRole("button", { name: /Scaling Up ·/ }).allTextContents();
  expect(catalog).toHaveLength(1);

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await login(admin, "admin");
  await admin.goto(host("admin"));
  await expect(admin.getByText("No summary reports yet.")).toBeVisible();
  await screenshots(admin, "admin-empty");
  await admin.getByRole("button", { name: "Open Wizard" }).click();
  expect(await admin.getByRole("dialog").getByRole("button", { name: /Scaling Up ·/ }).allTextContents()).toEqual(catalog);
  await admin.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByRole("button", { name: "Scaling Up · CEO Full", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review", exact: true })).toBeDisabled();
  for (const [name, role] of [["Alex CEO", "CEO"], ["Dee Team", "Team"], ["Ed Team", "Team"]]) {
    await page.getByRole("button", { name: `Select ${name}`, exact: true }).click();
    await page.getByRole("button", { name: `Assign ${name} as ${role}`, exact: true }).click();
  }
  await screenshots(page, "composition");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ["Ed Team is Team", "Dee Team is Team", "Alex CEO is CEO"]) {
    const assigned = page.getByRole("button", { name, exact: true });
    await assigned.scrollIntoViewIfNeeded();
    await assigned.click({ trial: true });
  }
  // A stationary footer must not share the candidates' scrolling element;
  // otherwise cards can paint/click in the padding below the sticky footer.
  expect(await page.getByRole("button", { name: "Alex CEO is CEO", exact: true }).evaluate((button) => {
    let node = button.parentElement;
    while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) node = node.parentElement;
    return node ? Array.from(node.querySelectorAll("button")).some((item) => item.textContent === "Review") : true;
  })).toBe(false);
  await screenshots(page, "composition-bottom");
  await page.setViewportSize({ width: 390, height: 844 });
  const finalAction = page.getByRole("button", { name: "Assign Alex CEO as Team", exact: true });
  await finalAction.evaluate((button) => {
    let node = button.parentElement;
    while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) node = node.parentElement;
    if (node) node.scrollTop = node.scrollHeight;
  });
  await finalAction.click({ trial: true });
  const lastBox = await finalAction.boundingBox();
  const footerBox = await page.getByRole("button", { name: "Review", exact: true }).boundingBox();
  expect(lastBox!.y + lastBox!.height).toBeLessThan(footerBox!.y);
  // Capture the exact viewport just asserted; resizing would change scrollTop.
  await page.screenshot({ path: join(evidence, "composition-bottom-mobile.png"), fullPage: true, animations: "disabled" });
  await page.screenshot({ path: join(evidence, "composition-bottom-mobile-viewport.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("listitem").filter({ hasText: "Ed Team" }).getByRole("button", { name: "Move up" }).click();
  await expect(page.getByRole("dialog").getByRole("listitem").first()).toContainText("Ed Team");
  await screenshots(page, "review");

  const createdResponse = page.waitForResponse((response) => response.url().endsWith(api) && response.request().method() === "POST");
  await page.getByRole("button", { name: "Create report", exact: true }).dblclick();
  const response = await createdResponse;
  expect(response.status()).toBe(201);
  const command = response.request().postDataJSON();
  expect(command.sources).toEqual(sourceOrder);
  const retry = await page.request.post(`${proof.baseURL}${api}`, { data: command });
  expect(retry.status()).toBe(200);
  await expect(page.getByRole("button", { name: "View Scaling Q3 local proof" })).toHaveCount(1);
  await screenshots(page, "coach-populated");
  const rows = await proof.db.summaryReport.findMany({ include: { sources: { orderBy: [{ role: "asc" }, { position: "asc" }] } } });
  expect(rows).toHaveLength(1);
  const row = rows[0];
  reportId = row.id;
  checksum = row.artifactSha256;
  expect(row.sources.map(({ submissionId, role, position }) => ({ submissionId, role, position }))).toEqual(sourceOrder.map(({ submissionId, role, position }) => ({ submissionId, role, position })));
  expect(await proof.db.auditLog.count({ where: { entityId: reportId, action: "SUMMARY_REPORT_CREATE" } })).toBe(1);
  expect(row.inputHash).not.toBe(checksum);

  await admin.reload();
  await expect(admin.getByRole("button", { name: "View Scaling Q3 local proof" })).toHaveCount(1);
  await screenshots(admin, "admin-populated");
  for (const [role, active] of [["coach", page], ["admin", admin]] as const) {
    await active.getByRole("button", { name: "View Scaling Q3 local proof" }).click();
    await screenshots(active, `${role}-modal`);
    const viewed = active.waitForResponse((res) => res.url().includes(`/${reportId}/artifact?disposition=inline`));
    await active.getByRole("button", { name: "View", exact: true }).click();
    const pdf = await viewed;
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["cache-control"]).toBe("private, no-store");
    expect(pdf.headers()["x-frame-options"]).toBe("SAMEORIGIN");
    await pdf.finished();
    const popup = active.waitForEvent("popup");
    await active.getByRole("link", { name: "View in new tab" }).click();
    const tab = await popup;
    await tab.waitForURL(/artifact\?disposition=inline/, { timeout: 15_000 });
    await tab.close();
    const downloaded = active.waitForEvent("download");
    await active.getByRole("link", { name: "Download", exact: true }).click();
    const download = await downloaded;
    const path = join(proof.dir, `${role}.pdf`);
    await download.saveAs(path);
    expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(checksum);
    // Native paint still requires inspection of the exact final image; bytes,
    // HTTP success and a settling delay alone are not a visual PASS.
    await screenshots(active, `${role}-pdf-preview`, true);
    await active.getByRole("button", { name: "Close", exact: true }).click();
  }
  execFileSync("pdftoppm", ["-f", "1", "-l", "2", "-scale-to", "1400", "-png", join(proof.dir, "coach.pdf"), join(evidence, "local-pdf")]);
  execFileSync("pdftoppm", ["-f", "8", "-l", "8", "-scale-to", "1400", "-png", join(proof.dir, "coach.pdf"), join(evidence, "local-appendix")]);
  const parsed = execFileSync("pdftotext", [join(proof.dir, "coach.pdf"), "-"]).toString();
  expect(parsed).toContain("Alex CEO");
  expect(parsed).toContain("Person 1");
  expect(parsed).not.toContain("Dee Team");
  expect(parsed).not.toContain("Ed Team");
  await proof.addSubmission(1, campaignId, "-later");
  const after = await page.request.get(`${proof.baseURL}${api}/${reportId}/artifact`);
  expect(createHash("sha256").update(await after.body()).digest("hex")).toBe(checksum);
  expect((await proof.db.summaryReport.findUniqueOrThrow({ where: { id: reportId } })).inputHash).toBe(row.inputHash);
  console.log(`Immutable proof: report ${reportId}; artifact SHA-256 ${checksum}; exact ordered sources persisted; later submission unchanged`);
  await adminContext.close();
});

test("artifact auth/currency, checksum tamper and immutable database constraints fail closed", async ({ page, request }) => {
  await login(page, "coach");
  const url = `${proof.baseURL}${api}/${reportId}/artifact`;
  const unauthenticated = await request.get(url, { maxRedirects: 0 });
  // Existing NextAuth middleware redirects before the route's concealed 404.
  expect(unauthenticated.status()).toBe(307);
  expect(new URL(unauthenticated.headers().location, proof.baseURL).pathname).toBe("/api/auth/signin");
  expect(unauthenticated.headers()["content-type"]).not.toBe("application/pdf");
  await proof.db.coach.update({ where: { id: "proof-coach-profile" }, data: { certificationStatus: "EXPIRED" } });
  expect((await page.request.get(url)).status()).toBe(404);
  await proof.db.coach.update({ where: { id: "proof-coach-profile" }, data: { certificationStatus: "ACTIVE" } });

  // Source-specific revocation blocks new creation, but existing immutable
  // artifacts recheck DESTINATION currency only, as required by the spec.
  await proof.db.assessmentCampaign.update({ where: { id: sourceCampaignId }, data: { createdByCoachId: null } });
  const denied = await page.request.post(`${proof.baseURL}${api}`, { data: { reportType: "SCALING_CEO_FULL", creationRequestId: randomUUID(), sources: [sourceOrder[0], { submissionId: "proof-s-dee-history", sourceCampaignId, role: "TEAM", position: 0 }] } });
  expect(denied.status()).toBe(422);
  expect(await denied.json()).toEqual({ errors: [{ code: "source_unavailable", message: "One or more selected sources are unavailable or unauthorized." }] });
  expect((await page.request.get(url)).status()).toBe(200);
  await proof.db.assessmentCampaign.update({ where: { id: sourceCampaignId }, data: { createdByCoachId: "proof-coach-profile" } });

  const row = await proof.db.summaryReport.findUniqueOrThrow({ where: { id: reportId } });
  const file = join(proof.dir, "objects", row.artifactPath.replaceAll("/", "_"));
  const original = readFileSync(file);
  const corrupted = Buffer.from(original); corrupted[50] ^= 1;
  writeFileSync(file, corrupted);
  try {
    const bad = await page.request.get(url);
    expect(bad.status()).toBe(503);
    expect(await bad.json()).toEqual({ error: "Summary report artifact is temporarily unavailable." });
    expect(bad.headers()["cache-control"]).toBe("private, no-store");
  } finally { writeFileSync(file, original); }
  await expect(proof.db.summaryReport.update({ where: { id: reportId }, data: { name: "Forbidden mutation" } })).rejects.toThrow("rows are immutable");
  await expect(proof.db.summaryReport.delete({ where: { id: reportId } })).rejects.toThrow("rows are immutable");
  await expect(proof.db.summaryReportSource.updateMany({ where: { summaryReportId: reportId }, data: { position: 99 } })).rejects.toThrow("rows are immutable");
  await expect(proof.db.summaryReportSource.deleteMany({ where: { summaryReportId: reportId } })).rejects.toThrow("rows are immutable");
  const source = await proof.db.summaryReportSource.findFirstOrThrow({ where: { summaryReportId: reportId, role: "TEAM", position: 0 } });
  await expect(proof.db.summaryReportSource.create({ data: { ...source, id: "duplicate-source", position: 99 } })).rejects.toMatchObject({ code: "P2002" });
  await expect(proof.db.summaryReportSource.create({ data: { ...source, id: "duplicate-position", submissionId: "proof-s-dee-history" } })).rejects.toMatchObject({ code: "P2002" });
  expect(await proof.db.summaryReport.count()).toBe(1);
});

test("admin independently composes, reorders, double-creates, views and downloads one immutable report", async ({ page }) => {
  await login(page, "admin");
  await page.goto(host("admin", adminCampaignId));
  await expect(page.getByText("No summary reports yet.")).toBeVisible();
  await page.getByRole("button", { name: "Open Wizard" }).click();
  await page.getByRole("button", { name: "Scaling Up · CEO Full", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  for (const [name, role] of [["Alex CEO", "CEO"], ["Dee Team", "Team"], ["Ed Team", "Team"]]) {
    await page.getByRole("button", { name: `Select ${name}`, exact: true }).click();
    await page.getByRole("button", { name: `Assign ${name} as ${role}`, exact: true }).click();
  }
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("listitem").filter({ hasText: "Ed Team" }).getByRole("button", { name: "Move up" }).click();
  await screenshots(page, "admin-review-long-ids");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.getByRole("dialog").evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  const adminApi = `/api/assessment-campaigns/${adminCampaignId}/summary-reports`;
  const created = page.waitForResponse((res) => res.url().endsWith(adminApi) && res.request().method() === "POST");
  await page.getByRole("button", { name: "Create report", exact: true }).dblclick();
  const response = await created;
  expect(response.status()).toBe(201);
  const command = response.request().postDataJSON();
  expect(command.sources).toEqual(sourceOrder.map((source) => ({ ...source, submissionId: `${source.submissionId}${adminSourceSuffix}`, sourceCampaignId: adminCampaignId })));
  expect((await page.request.post(`${proof.baseURL}${adminApi}`, { data: command })).status()).toBe(200);
  await expect(page.getByRole("button", { name: "View Scaling admin local proof" })).toHaveCount(1);
  const rows = await proof.db.summaryReport.findMany({ where: { campaignId: adminCampaignId } });
  expect(rows).toHaveLength(1);
  const row = rows[0];
  await page.getByRole("button", { name: "View Scaling admin local proof" }).click();
  const viewed = page.waitForResponse((res) => res.url().includes(`/${row.id}/artifact?disposition=inline`));
  await page.getByRole("button", { name: "View", exact: true }).click();
  expect((await viewed).status()).toBe(200);
  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "View in new tab" }).click();
  const tab = await popup;
  await tab.waitForURL(/artifact\?disposition=inline/, { timeout: 15_000 });
  await tab.close();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download", exact: true }).click();
  const download = await downloaded;
  const path = join(proof.dir, "admin-created.pdf");
  await download.saveAs(path);
  expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(row.artifactSha256);
  await proof.addSubmission(2, adminCampaignId, "-admin-later");
  const after = await page.request.get(`${proof.baseURL}${adminApi}/${row.id}/artifact`);
  expect(createHash("sha256").update(await after.body()).digest("hex")).toBe(row.artifactSha256);
  expect((await proof.db.summaryReport.findUniqueOrThrow({ where: { id: row.id } })).inputHash).toBe(row.inputHash);
});

test("both real hosts preserve unsupported and kill/off legacy paths and permit DRAFT destinations", async ({ page, browser }) => {
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await login(page, "coach"); await login(admin, "admin");
  for (const [role, active] of [["coach", page], ["admin", admin]] as const) {
    await active.goto(host(role, unsupportedCampaignId));
    await expect(active.getByText("Summary Reports", { exact: true })).toHaveCount(0);
    await expect(active.getByTestId("campaign-detail-view-group-report")).toHaveAttribute("href", `/assessments/${unsupportedCampaignId}/report`);
  }
  await proof.db.assessmentCampaign.update({ where: { id: campaignId }, data: { status: "DRAFT" } });
  for (const [role, active] of [["coach", page], ["admin", admin]] as const) {
    await active.goto(host(role));
    await expect(active.getByText("Summary Reports", { exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const enabledWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  for (const flags of [{ killed: true }, { enabled: false }]) {
    await proof.startApp(flags);
    for (const [role, active] of [["coach", page], ["admin", admin]] as const) {
      await active.goto(host(role));
      await expect(active.getByText("Summary Reports", { exact: true })).toHaveCount(0);
      await expect(active.getByTestId("campaign-detail-view-group-report")).toHaveAttribute("href", `/assessments/${campaignId}/report`);
      expect((await active.request.get(`${proof.baseURL}${api}/${reportId}/artifact`)).status()).toBe(404);
    }
  }
  const disabledWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(disabledWidth).toBe(enabledWidth);
  console.log(`Mobile host width: enabled=${enabledWidth}, flag-off=${disabledWidth}, viewport=390 (existing host overflow, not wizard)`);
  await page.screenshot({ path: join(evidence, "coach-flag-off-mobile-viewport.png"), animations: "disabled" });
  await adminContext.close();
});
