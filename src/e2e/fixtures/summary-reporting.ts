import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, createWriteStream, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import sharp from "sharp";
import { buildTemplateContent } from "../../prisma/seed-scaling-up-full-assessment";
import golden from "../../src/__tests__/fixtures/summary-reports/scaling-ceo-full-snapshot.json";
import { scoreSubmission, TemplateVersionForScoringSchema } from "../../src/lib/assessments/scoring";

export const proofPassword = "Local-proof-only-2026!";
export const campaignId = "proof-scaling";
export const adminCampaignId = "proof-admin-scaling";
export const adminSourceSuffix = "-admin-with-a-deliberately-long-submission-identity";
export const sourceCampaignId = "proof-history";
export const unsupportedCampaignId = "proof-rockefeller";
const version = TemplateVersionForScoringSchema.parse(buildTemplateContent());
export const fixture = {
  version,
  submissions: ["s-ceo", "s-dee", "s-ed"].map((respondentId, index) => {
    const answers = golden.sources[0].answers.map((answer) => ({
      stableKey: answer.stableKey,
      value: index === 0 ? Number(answer.value) : index === 1 ? 4 : 8,
    }));
    return { respondentId, answers, result: scoreSubmission(version, answers, { allowMissingRequired: true }) };
  }),
};
export const json = (value: unknown) => value as Prisma.InputJsonValue;

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No loopback port");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

export async function startSummaryProof() {
  for (const file of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    if (existsSync(join(process.cwd(), file))) throw new Error(`Refusing local proof with ${file}; use an isolated checkout without environment files`);
  }
  const dir = mkdtempSync(join(tmpdir(), "summary-proof-"));
  // Synthetic raster only; served by the transport double, never live Blob.
  writeFileSync(join(dir, "coach.png"), await sharp({ create: { width: 64, height: 64, channels: 3, background: "#2299cc" } }).png().toBuffer());
  const dataDir = join(dir, "pg");
  mkdirSync(join(dir, "objects"));
  const pgPort = await unusedPort();
  const appPort = await unusedPort();
  const baseURL = `http://127.0.0.1:${appPort}`;
  const databaseURL = `postgresql://proof@127.0.0.1:${pgPort}/summary_proof`;
  // Deliberate allowlist: no inherited .env, database, token, Redis, or demo mode.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "development",
    DATABASE_URL: databaseURL,
    DIRECT_URL: databaseURL,
    NEXTAUTH_URL: baseURL,
    NEXTAUTH_SECRET: "summary-proof-local-secret-not-valid-outside-this-process",
    ADMIN_EMAIL: "admin@summary-proof.example",
    DEMO_MODE: "false",
    NEXT_TELEMETRY_DISABLED: "1",
    SUMMARY_REPORTING_ENABLED: "1",
    SUMMARY_REPORTING_CANARY: "",
    SUMMARY_REPORTING_KILL: "0",
    WAVE_J_SUFULL_GROUP_ENABLED: "1",
    WAVE_QSP_ROCK_GROUP_REPORT_ENABLED: "1",
    SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_summaryproof_000000000000000000000000000000",
    VERCEL_BLOB_API_URL: "http://127.0.0.1:48999",
    VERCEL_BLOB_RETRIES: "0",
    SUMMARY_PROOF_DIR: dir,
    NODE_OPTIONS: `--require=${join(process.cwd(), "e2e/fixtures/summary-blob.cjs")}`,
  };
  const db = new PrismaClient({ datasourceUrl: databaseURL });
  let server: ChildProcess | undefined;
  let pgStarted = false;
  const log = createWriteStream(join(dir, "app.log"));
  async function stopApp() {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise<void>((resolve) => server!.once("exit", () => resolve()));
    }
    server = undefined;
  }
  async function startApp(flags: { killed?: boolean; enabled?: boolean } = {}) {
    await stopApp();
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(appPort)], {
      env: { ...env, SUMMARY_REPORTING_KILL: flags.killed ? "1" : "0", SUMMARY_REPORTING_ENABLED: flags.enabled === false ? "0" : "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout!.pipe(log, { end: false });
    server.stderr!.pipe(log, { end: false });
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error(`Proof app exited; inspect ${dir}/app.log`);
      try { if ((await fetch(`${baseURL}/login`)).ok) return; } catch { /* await readiness */ }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(`Proof app readiness timed out; inspect ${dir}/app.log`);
  }
  async function stop() {
    await stopApp();
    await db.$disconnect();
    if (pgStarted) execFileSync("/opt/homebrew/bin/pg_ctl", ["-D", dataDir, "-m", "fast", "-w", "stop"]);
    pgStarted = false;
    log.end();
    // Keep logs for the task report, remove only this fixture-owned database.
    rmSync(dataDir, { recursive: true, force: true });
    console.log(`Local proof cleanup: app stopped; PostgreSQL stopped; owned database removed (${dir})`);
  }
  try {
    execFileSync("/opt/homebrew/bin/initdb", ["-D", dataDir, "-A", "trust", "-U", "proof", "--no-locale", "--encoding=UTF8"], { env: { PATH: env.PATH, HOME: env.HOME, NODE_ENV: "development" } });
    execFileSync("/opt/homebrew/bin/pg_ctl", ["-D", dataDir, "-l", join(dir, "pg.log"), "-o", `-h 127.0.0.1 -p ${pgPort} -k ${dir} -c timezone=Asia/Manila`, "-w", "start"]);
    pgStarted = true;
    execFileSync("/opt/homebrew/bin/createdb", ["-h", "127.0.0.1", "-p", String(pgPort), "-U", "proof", "summary_proof"]);
    // Historic migrations lack the initial categories baseline and cannot
    // bootstrap an empty DB. Use the release's exact pre-feature main schema, then execute the
    // complete new migration unchanged (including its immutable triggers).
    const baseline = join(dir, "baseline.prisma");
    // Stable main ancestor includes the current auth/presentation schema and
    // survives squash merges of this feature branch.
    writeFileSync(baseline, execFileSync("git", ["show", "95d2228c9114982574d4cf60af897aae60b3e3f8:src/prisma/schema.prisma"]));
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate", "--schema", baseline], { env: { PATH: env.PATH, HOME: env.HOME, NODE_ENV: "development", DATABASE_URL: databaseURL, DIRECT_URL: databaseURL }, stdio: "pipe" });
    execFileSync("/opt/homebrew/bin/psql", [databaseURL, "-v", "ON_ERROR_STOP=1", "-f", "prisma/migrations/20260827090000_add_summary_reports/migration.sql"], { stdio: "pipe" });
    const passwordHash = await hash(proofPassword, 10);
    for (const role of ["ADMIN", "COACH"]) await db.user.create({ data: { id: `proof-${role.toLowerCase()}`, email: `${role.toLowerCase()}@summary-proof.example`, name: `Proof ${role}`, role, passwordHash } });
    await db.coach.create({ data: { id: "proof-coach-profile", userId: "proof-coach", email: "coach@summary-proof.example", firstName: "Casey", lastName: "Coach", profileImage: "https://summaryproof.public.blob.vercel-storage.com/coach-profiles/synthetic.png", certificationStatus: "ACTIVE" } });
    await db.organization.create({ data: { id: "proof-org", name: "Example Manufacturing", ownerCoachId: "proof-coach-profile" } });
    await db.accessGroup.create({ data: { id: "proof-access", name: "Local proof", createdBy: "proof-admin" } });
    await db.accessGroupCoach.create({ data: { accessGroupId: "proof-access", coachId: "proof-coach-profile", addedBy: "proof-admin" } });
    for (const [id, alias, name] of [["proof-template", "scaling-up-full", "Scaling Up Full"], ["proof-other-template", "RockHabits", "Rockefeller Habits"]]) {
      await db.assessmentTemplate.create({ data: { id, alias, name, invitationSubject: "Local proof", invitationBodyMarkdown: "Local proof; no delivery", createdBy: "proof-admin" } });
      await db.assessmentTemplateVersion.create({ data: { id: `${id}-v1`, templateId: id, versionNumber: 1, language: "en", questions: json(fixture.version.questions), sections: json(fixture.version.sections), scoringConfig: json(fixture.version.scoringConfig), contentHash: "proof-frozen-version", publishedAt: new Date("2026-08-01T00:00:00Z") } });
      await db.accessGroupTemplate.create({ data: { accessGroupId: "proof-access", templateId: id, addedBy: "proof-admin" } });
    }
    for (const [id, name, templateId] of [[campaignId, "Scaling Q3 local proof", "proof-template"], [adminCampaignId, "Scaling admin local proof", "proof-template"], [sourceCampaignId, "Scaling historical sources", "proof-template"], [unsupportedCampaignId, "Unsupported family proof", "proof-other-template"]]) {
      await db.assessmentCampaign.create({ data: { id, name, alias: id, templateId, versionId: `${templateId}-v1`, organizationId: "proof-org", language: "en", status: "ACTIVE", accessMode: "INVITED", openAt: new Date("2026-08-01T00:00:00Z"), endMode: "OPEN_END", createdBy: "proof-coach", createdByCoachId: "proof-coach-profile", notifyAdminOnSubmit: false } });
    }
    async function addSubmission(index: number, target = campaignId, suffix = "") {
      const source = fixture.submissions[index];
      const id = `proof-${source.respondentId}${suffix}`;
      const respondentId = `${id}-respondent`;
      const names = [["Alex", "CEO"], ["Dee", "Team"], ["Ed", "Team"]][index];
      await db.orgRespondent.create({ data: { id: respondentId, organizationId: "proof-org", email: `${id}@summary-proof.example`, firstName: names[0], lastName: names[1], jobTitle: index === 0 ? "CEO" : "Team member", dedupeSource: "email", dedupeValue: id } });
      await db.assessmentCampaignParticipant.create({ data: { campaignId: target, respondentId, isCEO: index === 0, teamPathAtAdd: [], teamLabelsAtAdd: [] } });
      const invitation = await db.assessmentInvitation.create({ data: { campaignId: target, respondentId, tokenHash: id, status: "SUBMITTED", submittedAt: new Date("2026-08-20T09:00:00Z"), expiresAt: new Date("2027-01-01T00:00:00Z") } });
      return db.assessmentSubmission.create({ data: { id, campaignId: target, respondentId, invitationId: invitation.id, answers: json(source.answers), result: json(source.result), submittedAt: new Date(`2026-08-${20 + index}T09:00:00Z`) } });
    }
    for (let i = 0; i < 3; i++) await addSubmission(i);
    for (let i = 0; i < 3; i++) await addSubmission(i, adminCampaignId, adminSourceSuffix);
    await addSubmission(1, sourceCampaignId, "-history");
    await startApp();
    console.log(`Local proof resources: ${dir}; PostgreSQL loopback:${pgPort}; app ${baseURL}; real auth/DB, simulated Blob transport, development limiter`);
    return { dir, baseURL, db, startApp, stop, addSubmission };
  } catch (error) { await stop(); throw error; }
}
