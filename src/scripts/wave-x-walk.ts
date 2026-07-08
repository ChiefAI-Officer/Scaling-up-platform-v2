/**
 * Wave X launch walk — exercises the LVA + Rockefeller restricted-import
 * ENGINE end-to-end against the prod DB using the SANITIZED golden fixtures
 * (no real PII written to prod), into a throwaway org, then quarantines.
 *
 * Phases (arg): preview (pure, no writes) | commit | verify | quarantine.
 * The Wave X flag is NOT flipped globally — this drives the engine directly,
 * the same functions the HTTP route calls (route-layer flag/zod/entitlement
 * already covered by 81 route tests).
 *
 * Usage: npx tsx --env-file=.env scripts/wave-x-walk.ts <preview|commit|verify|quarantine>
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import {
  RESTRICTED_INSTRUMENTS,
  detectBatchShape,
  checkMatAllowed,
} from "../src/lib/assessments/esperto-import/restricted-instruments";
import {
  resolveRestrictedImportContext,
  buildRealRestrictedCommitDb,
  resolveEspertoImportHashSalt,
  type RestrictedCommitPrismaLike,
} from "../src/lib/assessments/esperto-import/restricted-route-helpers";
import { buildRestrictedImportPlan } from "../src/lib/assessments/esperto-import/restricted-plan";
import { commitRestrictedImport } from "../src/lib/assessments/esperto-import/restricted-commit";
import type { TemplateVersionForScoring } from "../src/lib/assessments/scoring";

const db = new PrismaClient();
const MODE = process.argv[2] ?? "preview";

const OWNER_COACH = "cmpapo3uf0009o0xzx8lsxdgb"; // sarah.johnson (ACTIVE)
const ADMIN_USER = "cmpapnpel0000o0xzqq049auq"; // prod admin
const ORG_EXTERNAL = "wavex-walk-throwaway";
const FIX = "src/__tests__/lib/assessments/esperto-import/fixtures/";
const ROUND = "WAVEX WALK";

const adminActor = { userId: ADMIN_USER, role: "ADMIN" as const, coachId: null, email: "walk@local" };

type Restricted = { reportid: string; date: string; name: string | null; tags: unknown[]; mat: string; cid: string; mid: string; raw: Record<string, unknown>; processed: unknown };
function loadFixture(f: string): Restricted {
  return JSON.parse(readFileSync(FIX + f, "utf-8"));
}

async function ensureOrgAndRoster(): Promise<{ orgId: string; midInOrg: string }> {
  let org = await db.organization.findFirst({ where: { externalId: ORG_EXTERNAL, deletedAt: null } });
  if (!org) {
    org = await db.organization.create({
      data: { name: "WAVEX WALK (test)", externalId: ORG_EXTERNAL, ownerCoachId: OWNER_COACH },
    });
    console.log("created throwaway org:", org.id);
  } else {
    console.log("reusing throwaway org:", org.id);
  }
  // Both golden fixtures share mid "midGold01" — one roster member resolves both.
  const mid = "midGold01";
  const existing = await db.orgRespondent.findFirst({ where: { organizationId: org.id, externalId: mid, deletedAt: null } });
  if (!existing) {
    await db.orgRespondent.create({
      data: {
        organizationId: org.id, email: "walk-member@local.test", normalizedEmail: "walk-member@local.test",
        firstName: "Walk", lastName: "Member", externalId: mid, dedupeSource: "external", dedupeValue: mid,
      },
    });
    console.log("created roster member externalId=", mid);
  }
  return { orgId: org.id, midInOrg: mid };
}

async function runInstrument(instrumentKey: string, fixture: string, orgId: string, write: boolean) {
  const inst = RESTRICTED_INSTRUMENTS.find((i) => i.instrumentKey === instrumentKey)!;
  const file = loadFixture(fixture);
  console.log(`\n=== ${inst.uiLabel} (${fixture}) ===`);

  const ctx = await resolveRestrictedImportContext(db, inst);
  if (!ctx.ok) { console.log("  CONTEXT ERROR:", ctx.code, ctx.error); return; }
  console.log("  version:", ctx.publishedVersion.id, "| crosswalk locked:", ctx.crosswalk.locked, "| scorables:", ctx.scorableStableKeys.length);

  // Shape + mat guards (what the route runs at step 5b).
  const shape = detectBatchShape(inst, [Object.keys(file.raw)]);
  console.log("  shape agreement:", shape.ok ? "OK" : `REJECT (${!shape.ok && shape.errors[0]?.reason})`);
  const mat = checkMatAllowed(inst, file.mat);
  console.log("  mat gate:", mat.ok ? "allowed (knownMats null = off, case-b)" : "REJECT");

  const respondents = await db.orgRespondent.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, externalId: true } });
  const plan = buildRestrictedImportPlan({
    files: [file] as never,
    crosswalk: ctx.crosswalk,
    roundLabel: ROUND,
    targetOrgId: orgId,
    respondents,
    versionQuestions: ctx.versionQuestions,
    scorableStableKeys: ctx.scorableStableKeys,
    instrument: { externalIdPrefix: inst.externalIdPrefix },
    hashSalt: resolveEspertoImportHashSalt(),
  });
  console.log("  plan: creates=", plan.campaign?.rows.length ?? 0, "skips=", plan.skips.length, "blocks=", JSON.stringify(plan.blocks));
  console.log("  externalId:", plan.campaign?.externalId);

  if (!write) return;
  if (plan.blocks.length > 0 || !plan.campaign) { console.log("  NOT committing — blocked"); return; }

  const commitDb = buildRealRestrictedCommitDb(db as unknown as RestrictedCommitPrismaLike);
  const result = await commitRestrictedImport(commitDb, plan, {
    templateId: ctx.template.id,
    organizationId: orgId,
    ownerCoachId: OWNER_COACH,
    language: ctx.publishedVersion.language,
    createdByUserId: ADMIN_USER,
    previewResolvedVersionId: ctx.publishedVersion.id,
    commitResolvedVersionId: ctx.publishedVersion.id,
    versionForScoringForNewCampaign: {
      questions: ctx.publishedVersion.questions,
      sections: ctx.publishedVersion.sections,
      scoringConfig: ctx.publishedVersion.scoringConfig,
    } as unknown as TemplateVersionForScoring,
    instrumentKey: inst.instrumentKey,
    pinOrgCid: inst.participatesInOrgCidPin,
  }, adminActor as never);
  console.log("  COMMIT:", JSON.stringify(result));
}

async function rejectionEvidence(orgId: string) {
  console.log("\n=== REJECTION EVIDENCE (R2-2) ===");
  const lva = RESTRICTED_INSTRUMENTS.find((i) => i.instrumentKey === "lva")!;
  const rockFile = loadFixture("wavex-rock-golden.json");
  // (a) wrong-shape: Rockefeller file under the LVA instrument → detectBatchShape rejects.
  const wrongShape = detectBatchShape(lva, [Object.keys(rockFile.raw)]);
  console.log("  Rock file under LVA batchKind →", wrongShape.ok ? "WRONGLY ACCEPTED" : `rejected: ${!wrongShape.ok && wrongShape.errors[0].reason}`);
  // (b) unknown-mat: gate is off (case-b, knownMats null) → allowed; prove the gate WOULD reject if armed.
  const armed = { ...lva, knownMats: ["someVerifiedMat"] as const };
  const unknownMat = checkMatAllowed(armed, "totallyUnknownMat");
  console.log("  unknown mat (with gate armed) →", unknownMat.ok ? "WRONGLY ALLOWED" : `rejected: ${!unknownMat.ok && unknownMat.reason.slice(0, 50)}`);
  // (c) unresolved-roster: import a file whose mid is not on the roster → skip.
  const ctx = await resolveRestrictedImportContext(db, lva);
  if (ctx.ok) {
    const orphan = { ...loadFixture("wavex-lva-golden.json"), mid: "midDOESNOTEXIST" };
    const plan = buildRestrictedImportPlan({
      files: [orphan] as never, crosswalk: ctx.crosswalk, roundLabel: "REJECT TEST", targetOrgId: orgId,
      respondents: await db.orgRespondent.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, externalId: true } }),
      versionQuestions: ctx.versionQuestions, scorableStableKeys: ctx.scorableStableKeys,
      instrument: { externalIdPrefix: lva.externalIdPrefix }, hashSalt: resolveEspertoImportHashSalt(),
    });
    console.log("  unresolved mid →", plan.skips.length === 1 && plan.skips[0].reason === "unresolved-respondent" ? `skipped (${plan.skips[0].reason}), 0 rows` : `UNEXPECTED: ${JSON.stringify(plan.skips)}`);
  }
}

async function verify(orgId: string) {
  console.log("\n=== VERIFY ===");
  const campaigns = await db.assessmentCampaign.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: { id: true, alias: true, externalId: true, status: true, importManifest: true,
      submissions: { select: { id: true, respondentId: true, result: true } } },
  });
  for (const c of campaigns) {
    console.log(`  ${c.alias} [${c.status}] externalId=${c.externalId} submissions=${c.submissions.length} imported=${c.importManifest != null}`);
    for (const s of c.submissions) {
      const r = s.result as { overallTotal?: number; countAchieved?: number; findings?: unknown } | null;
      console.log(`    submission ${s.id}: overallTotal=${r?.overallTotal} countAchieved=${r?.countAchieved}`);
    }
  }
}

async function quarantine(orgId: string) {
  console.log("\n=== QUARANTINE (§5.5: campaigns first, then org) ===");
  const campaigns = await db.assessmentCampaign.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, externalId: true } });
  const now = new Date();
  for (const c of campaigns) {
    await db.assessmentCampaign.update({ where: { id: c.id }, data: { deletedAt: now, externalId: `${c.externalId}:quarantined:${now.getTime()}` } });
    console.log("  soft-deleted campaign:", c.id);
  }
  await db.orgRespondent.updateMany({ where: { organizationId: orgId, deletedAt: null }, data: { deletedAt: now } });
  await db.organization.update({ where: { id: orgId }, data: { deletedAt: now, externalId: `${ORG_EXTERNAL}:quarantined:${now.getTime()}` } });
  console.log("  soft-deleted roster + org");
}

async function main() {
  console.log(`-- Wave X walk: MODE=${MODE} --`);
  const { orgId } = await ensureOrgAndRoster();
  if (MODE === "preview") {
    await runInstrument("rockefeller", "wavex-rock-golden.json", orgId, false);
    await runInstrument("lva", "wavex-lva-golden.json", orgId, false);
    await rejectionEvidence(orgId);
  } else if (MODE === "commit") {
    await runInstrument("rockefeller", "wavex-rock-golden.json", orgId, true);
    await runInstrument("lva", "wavex-lva-golden.json", orgId, true);
  } else if (MODE === "verify") {
    await verify(orgId);
  } else if (MODE === "quarantine") {
    await quarantine(orgId);
  }
  await db.$disconnect();
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
