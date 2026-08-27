import { test, expect, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { canonicalJson } from "../src/lib/assessments/summary-reports/canonical";
import { buildScalingCeoFullSnapshot } from "../src/lib/assessments/summary-reports/scaling-ceo-full-snapshot";
import { createPrismaSummaryReportCreateDb } from "../src/lib/assessments/summary-reports/create";
import { campaignId, adminCampaignId, adminSourceSuffix, sourceCampaignId, unsupportedCampaignId, proofPassword, startSummaryProof, json } from "./fixtures/summary-reporting";

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
  // Exercise real UI authentication with the supported return-to path, without
  // compiling the unrelated dashboard before this campaign-local proof.
  const destination = host(role);
  await page.goto(`${proof.baseURL}/login?callbackUrl=${encodeURIComponent(new URL(destination).pathname)}`);
  await page.getByLabel("Email", { exact: true }).fill(`${role}@summary-proof.example`);
  await page.getByLabel("Password", { exact: true }).fill(proofPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // After flag-test restarts, auth and the campaign page compile on demand.
  await expect(page).toHaveURL(destination, { timeout: 30_000 });
}
function host(role: "coach" | "admin", id = campaignId) {
  return `${proof.baseURL}/${role === "coach" ? "portal/assessments" : "admin/assessments/campaigns"}/${id}`;
}
async function screenshots(page: Page, state: string, nativePdf = false) {
  for (const [size, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    if (size === "mobile" && /-(empty|populated)$/.test(state)) {
      const heading = page.getByText("Summary Reports", { exact: true });
      await heading.evaluate((node) => node.scrollIntoView({ block: "start", inline: "start" }));
      await expect(heading).toBeInViewport();
      const action = page.getByRole("button", { name: state.endsWith("empty") ? "Open Wizard" : "View Scaling Q3 local proof", exact: true });
      await action.click({ trial: true });
      await expect(action).toBeInViewport();
      console.log(`${state}: 390px panel/action reachable; document width=${await page.evaluate(() => document.documentElement.scrollWidth)}`);
    }
    if (nativePdf) {
      // Resize/foreground changes invalidate native PDF compositing. Settle
      // AFTER the final viewport, and avoid fullPage's implicit enlargement.
      await page.bringToFront();
      await page.waitForTimeout(3000);
    }
    // Actual viewport first: fullPage may temporarily enlarge the compositor.
    if (size === "mobile") await page.screenshot({ path: join(evidence, `${state}-mobile-viewport.png`), animations: "disabled" });
    await page.screenshot({ path: join(evidence, `${state}-${size}.png`), fullPage: !nativePdf, animations: "disabled" });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

test("coach/admin share one real catalog; compose, reorder, double-create and freeze one report", async ({ page, browser }) => {
  await login(page, "coach");
  await page.goto(host("coach"));
  expect((await page.request.get(`${proof.baseURL}/login`)).headers()["x-frame-options"]).toBe("DENY");
  // The isolated dev server compiles the report route on this first request.
  await expect(page.getByText("No summary reports yet.")).toBeVisible({ timeout: 30_000 });
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
    await page.getByRole("button", { name: `Add selected to ${role}`, exact: true }).click();
  }
  await screenshots(page, "composition");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ["Remove Ed Team from Team", "Remove Dee Team from Team", "Remove Alex CEO from CEO"]) {
    const assigned = page.getByRole("button", { name, exact: true });
    await assigned.scrollIntoViewIfNeeded();
    await assigned.click({ trial: true });
  }
  // Check every scrolling ancestor, not just the nested component list: the
  // Review footer must remain outside the whole composition's scrolling body.
  expect(await page.getByRole("button", { name: "Remove Alex CEO from CEO", exact: true }).evaluate((button) => {
    let node = button.parentElement;
    let foundScrollContainer = false;
    while (node && node.getAttribute("role") !== "dialog") {
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) {
        foundScrollContainer = true;
        if (Array.from(node.querySelectorAll("button")).some((item) => item.textContent === "Review")) return true;
      }
      node = node.parentElement;
    }
    return !foundScrollContainer;
  })).toBe(false);
  await screenshots(page, "composition-bottom");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Remove Ed Team from Team", exact: true }).click();
  await page.getByRole("button", { name: "Select Ed Team", exact: true }).click();
  const pending = page.getByRole("status").filter({ hasText: "1 selected, not yet included" });
  await pending.scrollIntoViewIfNeeded();
  await expect(pending).toBeInViewport();
  await expect(page.getByRole("button", { name: "Review", exact: true })).toBeDisabled();
  await page.screenshot({ path: join(evidence, "composition-pending-mobile-viewport.png"), animations: "disabled" });
  const finalAction = page.getByRole("button", { name: "Add selected to Team", exact: true });
  await finalAction.scrollIntoViewIfNeeded();
  await finalAction.click({ trial: true });
  const lastBox = await finalAction.boundingBox();
  const footerBox = await page.getByRole("button", { name: "Review", exact: true }).boundingBox();
  expect(lastBox!.y + lastBox!.height).toBeLessThan(footerBox!.y);
  // Capture the exact viewport just asserted; resizing would change scrollTop.
  await page.screenshot({ path: join(evidence, "composition-bottom-mobile.png"), fullPage: true, animations: "disabled" });
  await page.screenshot({ path: join(evidence, "composition-bottom-mobile-viewport.png"), animations: "disabled" });
  await finalAction.click();
  await expect(page.getByRole("status").filter({ hasText: "selected, not yet included" })).toHaveCount(0);
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
  expect(row).toMatchObject({ campaignId, reportType: "SCALING_CEO_FULL", name: "Scaling Q3 local proof", templateId: "proof-template", versionId: "proof-template-v1", language: "en", createdByUserId: "proof-coach", createdByEmailSnapshot: "coach@summary-proof.example", rendererVersion: "scaling-ceo-full-pdf-v1", creationRequestId: command.creationRequestId, moderationManifest: null });
  expect(row.artifactPath).toMatch(/^summary-reports\/proof-scaling\//);
  expect(row.artifactSizeBytes).toBeGreaterThan(1000);
  expect(row.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(await proof.db.$queryRaw<Array<{ timezone: string }>>`SELECT current_setting('TimeZone') AS timezone`).toEqual([{ timezone: "Asia/Manila" }]);
  const frozen = row.inputSnapshot as { coachImage: { base64: string; sha256: string } };
  expect(row.createdAt.toISOString()).toBe((row.inputSnapshot as { createdAt: string }).createdAt);
  expect(row.artifactCreatedAt.toISOString()).toBe((row.inputSnapshot as { createdAt: string }).createdAt);
  expect(frozen.coachImage).toBeDefined();
  expect(createHash("sha256").update(Buffer.from(frozen.coachImage.base64, "base64")).digest("hex")).toBe(frozen.coachImage.sha256);
  const rebuilt = await createPrismaSummaryReportCreateDb(proof.db).repeatableRead((tx) => buildScalingCeoFullSnapshot(tx.snapshotDb, { userId: "proof-coach", email: "coach@summary-proof.example", role: "COACH", coachId: "proof-coach-profile" }, { destinationCampaignId: campaignId, sources: command.sources, createdAt: row.createdAt }));
  if (rebuilt.kind !== "ok") throw new Error("Cannot reconstruct local proof snapshot");
  const expectedSnapshot = { ...rebuilt.snapshot, coachImage: frozen.coachImage };
  expect(createHash("sha256").update(canonicalJson(expectedSnapshot)).digest("hex")).toBe(row.inputHash);
  const stored = await proof.db.$queryRaw<Array<{ text: string }>>`SELECT "inputSnapshot"::text AS text FROM summary_reports WHERE id = ${row.id}`;
  expect(createHash("sha256").update(canonicalJson(JSON.parse(stored[0].text))).digest("hex")).toBe(row.inputHash);
  const prismaReadHash = createHash("sha256").update(canonicalJson(row.inputSnapshot)).digest("hex");
  console.log(`Exact stored JSON hash verified; Prisma JSON-read preserves identity=${prismaReadHash === row.inputHash}`);
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
  expect(parsed).not.toContain("CEO tier");
  expect(parsed.match(/Coached by Casey Coach/g)?.length).toBeGreaterThanOrEqual(8);
  expect(parsed).not.toContain("Dee Team");
  expect(parsed).not.toContain("Ed Team");
  await proof.addSubmission(1, campaignId, "-later");
  // Later coach profile/image changes cannot alter a frozen artifact or input.
  await proof.db.coach.update({ where: { id: "proof-coach-profile" }, data: { profileImage: "https://unsupported.example/changed.png", firstName: "Changed" } });
  const after = await page.request.get(`${proof.baseURL}${api}/${reportId}/artifact`);
  expect(createHash("sha256").update(await after.body()).digest("hex")).toBe(checksum);
  expect((await proof.db.summaryReport.findUniqueOrThrow({ where: { id: reportId } })).inputHash).toBe(row.inputHash);
  await proof.db.coach.update({ where: { id: "proof-coach-profile" }, data: { profileImage: "https://summaryproof.public.blob.vercel-storage.com/coach-profiles/synthetic.png", firstName: "Casey" } });
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
  const createDb = createPrismaSummaryReportCreateDb(proof.db);
  const copied = { ...row, id: randomUUID(), inputSnapshot: json(row.inputSnapshot), moderationManifest: undefined };
  await expect(createDb.repeatableRead((tx) => tx.createReport({ ...copied, artifactPath: `${row.artifactPath}-loser` }))).rejects.toMatchObject({ code: "P2002", meta: { target: ["creationRequestId"] } });
  await expect(createDb.repeatableRead((tx) => tx.createReport({ ...copied, creationRequestId: randomUUID() }))).rejects.toMatchObject({ code: "P2010", meta: { code: "23505" } });
  const rolledBackId = randomUUID();
  await expect(createDb.repeatableRead(async (tx) => {
    await tx.createReport({ ...copied, id: rolledBackId, creationRequestId: randomUUID(), artifactPath: `${row.artifactPath}-rollback` });
    await tx.createSources([{ summaryReportId: rolledBackId, submissionId: "proof-s-ceo", role: "CEO", position: 0, respondentSnapshot: {} }]);
    await tx.createAudit({ entityType: "SummaryReport", entityId: rolledBackId, action: "SUMMARY_REPORT_CREATE", performedBy: "proof-coach", changes: "{}" });
    throw new Error("deliberate local rollback");
  })).rejects.toThrow("deliberate local rollback");
  expect(await proof.db.summaryReport.count({ where: { id: rolledBackId } })).toBe(0);
  expect(await proof.db.summaryReportSource.count({ where: { summaryReportId: rolledBackId } })).toBe(0);
  expect(await proof.db.auditLog.count({ where: { entityId: rolledBackId } })).toBe(0);
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
  await expect(proof.db.summaryReportSource.create({ data: { ...source, respondentSnapshot: json(source.respondentSnapshot), id: "duplicate-source", position: 99 } })).rejects.toMatchObject({ code: "P2002" });
  await expect(proof.db.summaryReportSource.create({ data: { ...source, respondentSnapshot: json(source.respondentSnapshot), id: "duplicate-position", submissionId: "proof-s-dee-history" } })).rejects.toMatchObject({ code: "P2002" });
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
    await page.getByRole("button", { name: `Add selected to ${role}`, exact: true }).click();
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

test("concurrent identical requests retain one report, sources, audit and one artifact", async ({ page }) => {
  await proof.startApp();
  await proof.db.assessmentCampaign.update({ where: { id: campaignId }, data: { status: "ACTIVE" } });
  await login(page, "coach");
  const raceApi = `${proof.baseURL}/api/assessment-campaigns/${sourceCampaignId}/summary-reports`;
  const command = { reportType: "SCALING_CEO_FULL", creationRequestId: randomUUID(), sources: [sourceOrder[0]] };
  const responses = await Promise.all([page.request.post(raceApi, { data: command }), page.request.post(raceApi, { data: command })]);
  expect(responses.some((response) => response.status() === 201)).toBe(true);
  // Repeatable-read may surface serialization rejection for the loser; a retry
  // must still resolve to the one winner, never manufacture another report.
  expect(responses.map((response) => response.status()).every((status) => [200, 201, 503].includes(status))).toBe(true);
  expect((await page.request.post(raceApi, { data: command })).status()).toBe(200);
  const reports = await proof.db.summaryReport.findMany({ where: { creationRequestId: command.creationRequestId }, include: { sources: true } });
  expect(reports).toHaveLength(1);
  expect(reports[0].sources).toHaveLength(1);
  expect(await proof.db.auditLog.count({ where: { entityId: reports[0].id, action: "SUMMARY_REPORT_CREATE" } })).toBe(1);
  expect(readdirSync(join(proof.dir, "objects")).filter((file) => file.includes(command.creationRequestId))).toHaveLength(1);
  console.log(`Concurrent request statuses: ${responses.map((response) => response.status()).join(",")}; one report/source/audit/artifact retained`);
});
