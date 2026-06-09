/**
 * Tests for the GLOBAL SOLO_LANDING Kajabi rollout — RUNNER (DB-touching
 * orchestration), driven with a MOCK Prisma client + injected reinterpolate /
 * resolveFacts. No real DB.
 *
 * Covers:
 *   Script 1: resolveGlobalSoloTemplate (>1 fails loud), buildTemplateUpdatePlan,
 *             applyTemplateUpdate (CAS + backup-before-write + audit), restore.
 *   Script 2: buildBackfillPlans (targets/no-ops/skips + every preflight),
 *             applyBackfillPlans (CAS, sanitizer-strip block, audit), restore.
 */

import {
  sha256,
  NEW_DESIGN_MARKER,
  type KajabiBackupFile,
  type TemplateBackupFile,
} from "../../lib/scripts/solo-landing-kajabi-core";
import {
  resolveGlobalSoloTemplate,
  buildTemplateUpdatePlan,
  applyTemplateUpdate,
  restoreTemplateFromBackup,
  buildBackfillPlans,
  applyBackfillPlans,
  restoreBackfill,
  type DbClient,
  type SanitizeOutcome,
  type WorkshopFacts,
} from "../../lib/scripts/solo-landing-kajabi-runner";

const HOST = "scaling-up-platform-v2.vercel.app";
const OLD_GLOBAL_ID = "tpl-old-global";

const OLD_TPL = `<div class="old">{{coach_name}}|{{registration_url}}</div>`;
const NEW_TPL = `<div class="su-mc" ${NEW_DESIGN_MARKER}>{{coach_name}}|<a class="btn" href="{{registration_url}}">Register Here</a></div>`;

function render(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(v);
  return out;
}
const clean = (sanitized: string): SanitizeOutcome => ({ sanitized, strippedTags: [], strippedAttrs: [] });

// Per-workshop variable fixtures.
const WS = {
  ws1: { coach_name: "Ada", registration_url: `https://${HOST}/workshop/ws1-reg` },
  ws2: { coach_name: "Alan", registration_url: `https://${HOST}/workshop/ws2-reg` },
};

function injectedReinterpolate(): jest.Mock {
  // Returns the rendered string for whatever template it is given, per workshop.
  // Third param (registrationUrl) is accepted but unused — runner passes it in (Fix 3).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return jest.fn(async (workshopId: string, tpl: string, _registrationUrl: string) => {
    const vars = (WS as Record<string, Record<string, string>>)[workshopId];
    if (!vars) return null;
    return clean(render(tpl, vars));
  });
}

function injectedFacts(overrides: Partial<Record<string, Partial<WorkshopFacts>>> = {}): jest.Mock {
  return jest.fn(async (workshopId: string): Promise<WorkshopFacts | null> => {
    const slug = `${workshopId}-reg`;
    const base: WorkshopFacts = {
      coachProfileImage: "https://cdn/photo.jpg",
      registrationUrl: `https://${HOST}/workshop/${slug}`,
      registrationSlug: slug,
      registrationPublished: true,
      renderedPrice: "$497",
    };
    return { ...base, ...(overrides[workshopId] ?? {}) };
  });
}

function makeAuditDb(extra: Partial<DbClient> = {}): { db: DbClient; auditCreate: jest.Mock } {
  const auditCreate = jest.fn().mockResolvedValue({});
  const db = {
    pageTemplate: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    landingPage: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    auditLog: { create: auditCreate },
    ...extra,
  } as DbClient;
  return { db, auditCreate };
}

// ════════════════════════════════════════════════════════════════════════════
//  Script 1
// ════════════════════════════════════════════════════════════════════════════

describe("Script 1 — resolveGlobalSoloTemplate", () => {
  it("returns the single active global template", async () => {
    const { db } = makeAuditDb({
      pageTemplate: {
        findMany: jest.fn().mockResolvedValue([
          { id: OLD_GLOBAL_ID, categoryId: null, isActive: true, customHtml: OLD_TPL, updatedAt: new Date() },
        ]),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    });
    const tpl = await resolveGlobalSoloTemplate(db);
    expect(tpl.id).toBe(OLD_GLOBAL_ID);
  });

  it("FAILS LOUDLY when more than one global active template exists", async () => {
    const { db } = makeAuditDb({
      pageTemplate: {
        findMany: jest.fn().mockResolvedValue([
          { id: "a", categoryId: null, isActive: true, customHtml: "x", updatedAt: new Date() },
          { id: "b", categoryId: null, isActive: true, customHtml: "y", updatedAt: new Date() },
        ]),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    });
    await expect(resolveGlobalSoloTemplate(db)).rejects.toThrow(/exactly ONE/);
  });

  it("FAILS when no active global template exists", async () => {
    const { db } = makeAuditDb();
    await expect(resolveGlobalSoloTemplate(db)).rejects.toThrow(/No active global/);
  });
});

describe("Script 1 — applyTemplateUpdate", () => {
  const updatedAt = new Date("2026-06-01T00:00:00Z");

  function templateDb(customHtml: string, count = 1) {
    const updateMany = jest.fn().mockResolvedValue({ count });
    const auditCreate = jest.fn().mockResolvedValue({});
    const db = {
      pageTemplate: {
        findMany: jest.fn().mockResolvedValue([
          { id: OLD_GLOBAL_ID, categoryId: null, isActive: true, customHtml, updatedAt },
        ]),
        findUnique: jest.fn(),
        updateMany,
      },
      landingPage: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
      auditLog: { create: auditCreate },
    } as DbClient;
    return { db, updateMany, auditCreate };
  }

  it("CAS-writes (where id+updatedAt), backs up first, then audits", async () => {
    const { db, updateMany, auditCreate } = templateDb(OLD_TPL);
    const plan = await buildTemplateUpdatePlan(db, { newSanitized: NEW_TPL });
    const writeBackup = jest.fn().mockResolvedValue("/tmp/tpl-backup.json");
    const result = await applyTemplateUpdate(db, plan, {
      writeBackup,
      operator: "ops@x.com",
      runId: "run-1",
    });
    expect(result.status).toBe("applied");
    expect(writeBackup).toHaveBeenCalledTimes(1);
    expect(writeBackup.mock.invocationCallOrder[0]).toBeLessThan(updateMany.mock.invocationCallOrder[0]);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: OLD_GLOBAL_ID, updatedAt },
      data: { customHtml: NEW_TPL },
    });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate.mock.calls[0][0].data.action).toBe("SOLO_LANDING_TEMPLATE_UPDATE");
  });

  it("no-op when the template already equals the new artifact", async () => {
    const { db, updateMany } = templateDb(NEW_TPL);
    const plan = await buildTemplateUpdatePlan(db, { newSanitized: NEW_TPL });
    const result = await applyTemplateUpdate(db, plan, {
      writeBackup: jest.fn(),
      operator: "o",
      runId: "r",
    });
    expect(result.status).toBe("no-op");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("CAS abort when the operator-supplied expected SHA does not match live", async () => {
    const { db, updateMany } = templateDb(OLD_TPL);
    const plan = await buildTemplateUpdatePlan(db, { newSanitized: NEW_TPL });
    const result = await applyTemplateUpdate(db, plan, {
      writeBackup: jest.fn().mockResolvedValue("/tmp/x.json"),
      operator: "o",
      runId: "r",
      expectedOldSha: "deadbeef",
    });
    expect(result.status).toBe("cas-abort");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("CAS abort when updateMany matches 0 rows (concurrent edit)", async () => {
    const { db } = templateDb(OLD_TPL, 0);
    const plan = await buildTemplateUpdatePlan(db, { newSanitized: NEW_TPL });
    const result = await applyTemplateUpdate(db, plan, {
      writeBackup: jest.fn().mockResolvedValue("/tmp/x.json"),
      operator: "o",
      runId: "r",
    });
    expect(result.status).toBe("cas-abort");
  });
});

describe("Script 1 — restoreTemplateFromBackup", () => {
  const updatedAt = new Date("2026-06-02T00:00:00Z");
  const backup: TemplateBackupFile = {
    kind: "solo-landing-template-update",
    runId: "run-1",
    createdAt: new Date().toISOString(),
    databaseHost: HOST,
    templateId: OLD_GLOBAL_ID,
    oldUpdatedAt: new Date("2026-06-01T00:00:00Z").toISOString(),
    oldSha: sha256(OLD_TPL),
    newSha: sha256(NEW_TPL),
    oldCustomHtml: OLD_TPL,
  };

  it("CAS-restores when live still equals the value we wrote (newSha)", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditCreate = jest.fn().mockResolvedValue({});
    const db = {
      pageTemplate: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          id: OLD_GLOBAL_ID,
          categoryId: null,
          isActive: true,
          customHtml: NEW_TPL,
          updatedAt,
        }),
        updateMany,
      },
      landingPage: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
      auditLog: { create: auditCreate },
    } as DbClient;
    const r = await restoreTemplateFromBackup(db, backup, { operator: "o", runId: "r2" });
    expect(r.status).toBe("restored");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: OLD_GLOBAL_ID, updatedAt },
      data: { customHtml: OLD_TPL },
    });
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it("refuses to clobber a LATER edit (live sha is neither old nor new)", async () => {
    const updateMany = jest.fn();
    const db = {
      pageTemplate: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          id: OLD_GLOBAL_ID,
          categoryId: null,
          isActive: true,
          customHtml: "<div>SOMEONE EDITED THIS LATER</div>",
          updatedAt,
        }),
        updateMany,
      },
      landingPage: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn() },
    } as DbClient;
    const r = await restoreTemplateFromBackup(db, backup, { operator: "o", runId: "r2" });
    expect(r.status).toBe("cas-abort");
    expect(updateMany).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  Script 2
// ════════════════════════════════════════════════════════════════════════════

function backfillDb(pages: unknown[]): { db: DbClient; updateMany: jest.Mock; auditCreate: jest.Mock } {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const auditCreate = jest.fn().mockResolvedValue({});
  const db = {
    pageTemplate: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    landingPage: {
      findMany: jest.fn().mockResolvedValue(pages),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany,
      update: jest.fn().mockResolvedValue({}),
    },
    auditLog: { create: auditCreate },
  } as DbClient;
  return { db, updateMany, auditCreate };
}

const baseInput = {
  oldGlobalTemplateId: OLD_GLOBAL_ID,
  oldTemplateCustomHtml: OLD_TPL,
  newTemplateCustomHtml: NEW_TPL,
  expectedHost: HOST,
  allowPriceWorkshopIds: [] as string[],
};

describe("Script 2 — buildBackfillPlans targeting + preflights", () => {
  it("targets a row whose current customHtml == its per-workshop OLD render", async () => {
    const oldRenderWs1 = render(OLD_TPL, WS.ws1);
    const { db } = backfillDb([
      {
        id: "lp1",
        workshopId: "ws1",
        slug: "ws1-solo",
        customHtml: oldRenderWs1,
        updatedAt: new Date(),
        categoryId: null,
        sourceTemplateId: OLD_GLOBAL_ID,
      },
    ]);
    const { plans, counts } = await buildBackfillPlans(db, injectedReinterpolate(), injectedFacts(), baseInput);
    expect(counts.targets).toBe(1);
    expect(plans[0].decision).toBe("target");
    expect(plans[0].newSha).toBe(sha256(render(NEW_TPL, WS.ws1)));
  });

  it("marks an already-migrated row (current == new render) a no-op", async () => {
    const newRenderWs1 = render(NEW_TPL, WS.ws1);
    const { db } = backfillDb([
      {
        id: "lp1",
        workshopId: "ws1",
        slug: "ws1-solo",
        customHtml: newRenderWs1,
        updatedAt: new Date(),
        categoryId: null,
        sourceTemplateId: null,
      },
    ]);
    const { counts } = await buildBackfillPlans(db, injectedReinterpolate(), injectedFacts(), baseInput);
    expect(counts.noops).toBe(1);
    expect(counts.targets).toBe(0);
  });

  it("skips a bespoke row (current matches neither old nor new) — never clobbered", async () => {
    const { db } = backfillDb([
      {
        id: "lp1",
        workshopId: "ws1",
        slug: "ws1-solo",
        customHtml: "<div>HAND EDITED BESPOKE</div>",
        updatedAt: new Date(),
        categoryId: null,
        sourceTemplateId: null,
      },
    ]);
    const { plans, counts } = await buildBackfillPlans(db, injectedReinterpolate(), injectedFacts(), baseInput);
    expect(counts.skips).toBe(1);
    expect(plans[0].skipReason).toBe("bespoke-or-category-scoped");
  });

  it("skips a row whose coach has no photo", async () => {
    const { db } = backfillDb([
      {
        id: "lp1",
        workshopId: "ws1",
        slug: "ws1-solo",
        customHtml: render(OLD_TPL, WS.ws1),
        updatedAt: new Date(),
        categoryId: null,
        sourceTemplateId: OLD_GLOBAL_ID,
      },
    ]);
    const facts = injectedFacts({ ws1: { coachProfileImage: "" } });
    const { plans } = await buildBackfillPlans(db, injectedReinterpolate(), facts, baseInput);
    expect(plans[0].decision).toBe("skip");
    expect(plans[0].skipReason).toBe("missing-coach-photo");
  });

  it("skips a row whose CTA points at an unpublished registration", async () => {
    const { db } = backfillDb([
      {
        id: "lp1",
        workshopId: "ws1",
        slug: "ws1-solo",
        customHtml: render(OLD_TPL, WS.ws1),
        updatedAt: new Date(),
        categoryId: null,
        sourceTemplateId: OLD_GLOBAL_ID,
      },
    ]);
    const facts = injectedFacts({ ws1: { registrationPublished: false } });
    const { plans } = await buildBackfillPlans(db, injectedReinterpolate(), facts, baseInput);
    expect(plans[0].skipReason).toBe("cta-preflight-failed");
  });

  it("skips a TBD-price row unless an --allow-price exception is set", async () => {
    const pages = [
      {
        id: "lp1",
        workshopId: "ws1",
        slug: "ws1-solo",
        customHtml: render(OLD_TPL, WS.ws1),
        updatedAt: new Date(),
        categoryId: null,
        sourceTemplateId: OLD_GLOBAL_ID,
      },
    ];
    const facts = injectedFacts({ ws1: { renderedPrice: "TBD" } });

    const { db: db1 } = backfillDb(pages);
    const noException = await buildBackfillPlans(db1, injectedReinterpolate(), facts, baseInput);
    expect(noException.plans[0].skipReason).toBe("price-preflight-failed");

    const { db: db2 } = backfillDb(pages);
    const withException = await buildBackfillPlans(db2, injectedReinterpolate(), injectedFacts({ ws1: { renderedPrice: "TBD" } }), {
      ...baseInput,
      allowPriceWorkshopIds: ["ws1"],
    });
    expect(withException.plans[0].decision).toBe("target");
  });

  it("skips a row whose sourceTemplateId points at a different template", async () => {
    const { db } = backfillDb([
      {
        id: "lp1",
        workshopId: "ws1",
        slug: "ws1-solo",
        customHtml: render(OLD_TPL, WS.ws1),
        updatedAt: new Date(),
        categoryId: "cat-x",
        sourceTemplateId: "tpl-category-scoped",
      },
    ]);
    const { plans } = await buildBackfillPlans(db, injectedReinterpolate(), injectedFacts(), baseInput);
    expect(plans[0].skipReason).toBe("source-template-mismatch");
  });
});

describe("Script 2 — applyBackfillPlans", () => {
  async function targetPlanForWs1() {
    const { db } = backfillDb([
      {
        id: "lp1",
        workshopId: "ws1",
        slug: "ws1-solo",
        customHtml: render(OLD_TPL, WS.ws1),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        categoryId: null,
        sourceTemplateId: OLD_GLOBAL_ID,
      },
    ]);
    const { plans } = await buildBackfillPlans(db, injectedReinterpolate(), injectedFacts(), baseInput);
    return plans;
  }

  it("CAS-writes target rows (where id+updatedAt), backs up first, audits", async () => {
    const plans = await targetPlanForWs1();
    const { db, updateMany, auditCreate } = backfillDb([]);
    const writeBackup = jest.fn().mockResolvedValue("/tmp/backfill.json");
    const result = await applyBackfillPlans(db, plans, {
      writeBackup,
      operator: "ops@x.com",
      runId: "run-2",
      newGlobalSha: "newglobalsha",
    });
    expect(result).toMatchObject({ updated: 1, skipped: 0, blocked: 0 });
    expect(writeBackup).toHaveBeenCalledTimes(1);
    expect(writeBackup.mock.invocationCallOrder[0]).toBeLessThan(updateMany.mock.invocationCallOrder[0]);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "lp1", updatedAt: new Date("2026-01-01T00:00:00Z") },
      data: { customHtml: render(NEW_TPL, WS.ws1) },
    });
    expect(auditCreate.mock.calls[0][0].data.action).toBe("SOLO_LANDING_BACKFILL_APPLY");
  });

  it("CAS abort (count 0) → skipped, no clobber", async () => {
    const plans = await targetPlanForWs1();
    const { db, updateMany } = backfillDb([]);
    updateMany.mockResolvedValue({ count: 0 });
    const result = await applyBackfillPlans(db, plans, {
      writeBackup: jest.fn().mockResolvedValue("/tmp/b.json"),
      operator: "o",
      runId: "r",
      newGlobalSha: "s",
    });
    expect(result).toMatchObject({ updated: 0, skipped: 1, blocked: 0 });
  });

  it("blocks the whole apply (no writes) when a target had sanitizer strips", async () => {
    const plans = await targetPlanForWs1();
    plans[0].sanitizerStripped = true;
    plans[0].strippedAttrs = ["onclick"];
    const { db, updateMany } = backfillDb([]);
    const writeBackup = jest.fn();
    const result = await applyBackfillPlans(db, plans, {
      writeBackup,
      operator: "o",
      runId: "r",
      newGlobalSha: "s",
    });
    expect(result.blocked).toBe(1);
    expect(writeBackup).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("does nothing when there are no targets (skip-only plan)", async () => {
    const { db } = backfillDb([
      {
        id: "lp1",
        workshopId: "ws1",
        slug: "ws1-solo",
        customHtml: "<div>bespoke</div>",
        updatedAt: new Date(),
        categoryId: null,
        sourceTemplateId: null,
      },
    ]);
    const { plans } = await buildBackfillPlans(db, injectedReinterpolate(), injectedFacts(), baseInput);
    const writeBackup = jest.fn();
    const result = await applyBackfillPlans(db, plans, {
      writeBackup,
      operator: "o",
      runId: "r",
      newGlobalSha: "s",
    });
    expect(result).toEqual({ updated: 0, skipped: 0, blocked: 0 });
    expect(writeBackup).not.toHaveBeenCalled();
  });
});

describe("Script 2 — restoreBackfill", () => {
  const backup: KajabiBackupFile = {
    kind: "solo-landing-kajabi-backfill",
    runId: "run-2",
    createdAt: new Date().toISOString(),
    databaseHost: HOST,
    oldGlobalTemplateId: OLD_GLOBAL_ID,
    newGlobalSha: "newglobalsha",
    entries: [
      {
        landingPageId: "lp1",
        workshopId: "ws1",
        slug: "ws1-solo",
        oldCustomHtml: render(OLD_TPL, WS.ws1),
        oldUpdatedAt: new Date("2026-01-01T00:00:00Z").toISOString(),
        oldSha: sha256(render(OLD_TPL, WS.ws1)),
        newSha: sha256(render(NEW_TPL, WS.ws1)),
      },
    ],
  };

  const restoreUpdatedAt = new Date("2026-05-01T00:00:00Z");

  it("restores rows still on the value we wrote (newSha) using CAS updateMany", async () => {
    const { db, auditCreate } = backfillDb([]);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
      customHtml: render(NEW_TPL, WS.ws1),
      updatedAt: restoreUpdatedAt,
    });
    const r = await restoreBackfill(db, backup, { operator: "o", runId: "r3" });
    expect(r).toEqual({ restored: 1, skipped: 0 });
    // Fix 2: must use CAS updateMany (not unconditional update)
    expect(db.landingPage.update).not.toHaveBeenCalled();
    expect(db.landingPage.updateMany).toHaveBeenCalledWith({
      where: { id: "lp1", updatedAt: restoreUpdatedAt },
      data: { customHtml: render(OLD_TPL, WS.ws1) },
    });
    expect(auditCreate.mock.calls[0][0].data.action).toBe("SOLO_LANDING_BACKFILL_RESTORE");
  });

  it("skips a row edited after our apply (SHA mismatch — no clobber)", async () => {
    const { db } = backfillDb([]);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
      customHtml: "<div>edited later</div>",
      updatedAt: restoreUpdatedAt,
    });
    const r = await restoreBackfill(db, backup, { operator: "o", runId: "r3" });
    expect(r).toEqual({ restored: 0, skipped: 1 });
    expect(db.landingPage.update).not.toHaveBeenCalled();
    expect(db.landingPage.updateMany).not.toHaveBeenCalled();
  });

  // Fix 1 (P1): fail-safe CAS — falsy newSha in backup → skip, never write.
  it("skips a row when entry.newSha is empty/falsy (corrupt backup — fail-safe)", async () => {
    const corruptBackup: KajabiBackupFile = {
      ...backup,
      entries: [{ ...backup.entries[0], newSha: "" }],
    };
    const { db } = backfillDb([]);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
      customHtml: render(NEW_TPL, WS.ws1),
      updatedAt: restoreUpdatedAt,
    });
    const r = await restoreBackfill(db, corruptBackup, { operator: "o", runId: "r3" });
    expect(r).toEqual({ restored: 0, skipped: 1 });
    expect(db.landingPage.update).not.toHaveBeenCalled();
    expect(db.landingPage.updateMany).not.toHaveBeenCalled();
  });

  // Fix 2 (P1): TOCTOU guard — concurrent edit between findUnique and updateMany → skipped.
  it("skips a row when updateMany matches 0 rows (concurrent edit between read and write)", async () => {
    const { db, auditCreate } = backfillDb([]);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
      customHtml: render(NEW_TPL, WS.ws1),
      updatedAt: restoreUpdatedAt,
    });
    // Simulate concurrent edit: CAS updateMany finds nothing (updatedAt already changed)
    (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    const r = await restoreBackfill(db, backup, { operator: "o", runId: "r3" });
    expect(r).toEqual({ restored: 0, skipped: 1 });
    expect(db.landingPage.update).not.toHaveBeenCalled();
    // Audit log is still written (with skipped=1, restored=0)
    expect(auditCreate.mock.calls[0][0].data.action).toBe("SOLO_LANDING_BACKFILL_RESTORE");
  });

  it("rejects a malformed backup", async () => {
    const { db } = backfillDb([]);
    await expect(
      restoreBackfill(db, { kind: "nope" } as unknown as KajabiBackupFile, { operator: "o", runId: "r" }),
    ).rejects.toThrow(/recognised/);
  });
});
