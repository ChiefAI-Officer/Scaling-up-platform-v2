/**
 * Tests for the Solo Landing customHtml backfill.
 *
 * Two layers:
 *   1. PURE core (backfill-solo-landing-customhtml-core): detection signatures,
 *      SHA, planRow, parseArgs — no DB.
 *   2. RUNNER (backfill-solo-landing-customhtml-runner): buildPlans / applyPlans /
 *      restoreFromBackup driven with a MOCK Prisma client + a stubbed
 *      reinterpolate fn (the interpolate/sanitize pipeline is injected).
 *
 * We additionally test the guard via the shared safe-seed-guard (checkGuard) to
 * lock the prod-host blocking behaviour the CLI wrapper relies on for --apply.
 */

import {
  needsRefresh,
  hasOldLogoMarkup,
  hasLiteralEventTimeToken,
  inspectNewValue,
  planRow,
  parseArgs,
  sha256,
  NEW_LOGO_SIGNATURE,
  type BackupFile,
} from "../../lib/scripts/backfill-solo-landing-customhtml-core";
import {
  buildPlans,
  applyPlans,
  restoreFromBackup,
  type DbClient,
  type SanitizeOutcome,
} from "../../lib/scripts/backfill-solo-landing-customhtml-runner";
import { checkGuard } from "../../lib/scripts/safe-seed-guard";

// ── Fixtures ────────────────────────────────────────────────────────────────

const OLD_LOGO_HTML =
  `<div class="su-brandbar"><span class="su-mark">` +
  `<span class="su-mark-q a"></span></span>` +
  `<span class="su-wordmark">SCALING UP</span></div>` +
  `<span class="su-meta-val">{{event_time}}</span>`;

const NEW_LOGO_HTML =
  `<div class="su-brandbar"><img class="su-logo" src="${NEW_LOGO_SIGNATURE}AAAA" alt="Scaling Up" /></div>` +
  `<span class="su-meta-val">9:00 AM CDT</span>`;

const CLEAN_SANITIZE = (sanitized: string): SanitizeOutcome => ({
  sanitized,
  strippedTags: [],
  strippedAttrs: [],
});

// ── 1. PURE core ──────────────────────────────────────────────────────────────

describe("detection signatures", () => {
  it("flags old CSS-quadrant logo markup", () => {
    expect(hasOldLogoMarkup(OLD_LOGO_HTML)).toBe(true);
    expect(hasOldLogoMarkup(NEW_LOGO_HTML)).toBe(false);
  });

  it("flags a literal {{event_time}} token (whitespace tolerant)", () => {
    expect(hasLiteralEventTimeToken("x {{event_time}} y")).toBe(true);
    expect(hasLiteralEventTimeToken("x {{ event_time }} y")).toBe(true);
    expect(hasLiteralEventTimeToken("9:00 AM CDT")).toBe(false);
  });

  it("needsRefresh is true for old logo OR literal token, false otherwise", () => {
    expect(needsRefresh(OLD_LOGO_HTML)).toBe(true);
    expect(needsRefresh(`only <span>{{event_time}}</span>`)).toBe(true);
    expect(needsRefresh(NEW_LOGO_HTML)).toBe(false);
    expect(needsRefresh("")).toBe(false);
    expect(needsRefresh(null)).toBe(false);
    expect(needsRefresh(undefined)).toBe(false);
  });

  it("inspectNewValue confirms logo present + time resolved + old gone", () => {
    expect(inspectNewValue(NEW_LOGO_HTML)).toEqual({
      hasNewLogo: true,
      eventTimeResolved: true,
      stillHasOldLogo: false,
    });
  });
});

describe("planRow", () => {
  it("marks a real change (different SHAs) as not a no-op", () => {
    const p = planRow({
      landingPageId: "lp1",
      workshopId: "ws1",
      oldCustomHtml: OLD_LOGO_HTML,
      newCustomHtml: NEW_LOGO_HTML,
      oldUpdatedAt: new Date("2026-01-01T00:00:00Z"),
      strippedTags: [],
      strippedAttrs: [],
    });
    expect(p.isNoOp).toBe(false);
    expect(p.oldSha).toBe(sha256(OLD_LOGO_HTML));
    expect(p.newSha).toBe(sha256(NEW_LOGO_HTML));
    expect(p.sanitizerStripped).toBe(false);
  });

  it("marks identical old==new as a no-op (idempotent)", () => {
    const p = planRow({
      landingPageId: "lp1",
      workshopId: "ws1",
      oldCustomHtml: NEW_LOGO_HTML,
      newCustomHtml: NEW_LOGO_HTML,
      oldUpdatedAt: new Date(),
      strippedTags: [],
      strippedAttrs: [],
    });
    expect(p.isNoOp).toBe(true);
  });

  it("flags sanitizer strips", () => {
    const p = planRow({
      landingPageId: "lp1",
      workshopId: "ws1",
      oldCustomHtml: OLD_LOGO_HTML,
      newCustomHtml: NEW_LOGO_HTML,
      oldUpdatedAt: new Date(),
      strippedTags: [],
      strippedAttrs: ["onerror"],
    });
    expect(p.sanitizerStripped).toBe(true);
  });
});

describe("parseArgs", () => {
  it("defaults to dry-run", () => {
    expect(parseArgs([])).toEqual({ mode: "dry-run", hasOverride: false });
  });
  it("recognises --apply + override flag", () => {
    expect(parseArgs(["--apply", "--i-know-this-is-prod"])).toEqual({
      mode: "apply",
      hasOverride: true,
    });
  });
  it("recognises --restore with the next arg as the file", () => {
    expect(parseArgs(["--restore", "/tmp/b.json"])).toEqual({
      mode: "restore",
      hasOverride: false,
      restoreFile: "/tmp/b.json",
    });
  });
});

// ── 2. RUNNER with mocked Prisma + injected reinterpolate ───────────────────

function makeDb(overrides: Partial<DbClient> = {}): {
  db: DbClient;
  updateMany: jest.Mock;
  update: jest.Mock;
  findUnique: jest.Mock;
} {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const update = jest.fn().mockResolvedValue({});
  const findUnique = jest.fn().mockResolvedValue(null);
  const db: DbClient = {
    pageTemplate: {
      findMany: jest.fn().mockResolvedValue([
        { id: "tpl-global", categoryId: null, customHtml: "<tpl>{{event_time}}{{logo}}</tpl>" },
      ]),
    },
    landingPage: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique,
      updateMany,
      update,
    },
    ...overrides,
  };
  return { db, updateMany, update, findUnique };
}

describe("buildPlans (dry-run shape)", () => {
  it("reports changes for target rows WITHOUT writing", async () => {
    const { db, updateMany, update } = makeDb({
      pageTemplate: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "tpl", categoryId: null, customHtml: "<tpl/>" }]),
      },
      landingPage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "lp-old",
            workshopId: "ws1",
            customHtml: OLD_LOGO_HTML,
            updatedAt: new Date("2026-01-01T00:00:00Z"),
            categoryId: null,
          },
          {
            id: "lp-fresh",
            workshopId: "ws2",
            customHtml: NEW_LOGO_HTML, // already current → NOT a target
            updatedAt: new Date(),
            categoryId: null,
          },
        ]),
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    });

    const reinterpolate = jest.fn().mockResolvedValue(CLEAN_SANITIZE(NEW_LOGO_HTML));
    const plans = await buildPlans(db, reinterpolate);

    // Only the old-logo row is a target; the fresh row is filtered by needsRefresh.
    expect(plans).toHaveLength(1);
    expect(plans[0].landingPageId).toBe("lp-old");
    expect(plans[0].isNoOp).toBe(false);
    expect(plans[0].checks.hasNewLogo).toBe(true);
    expect(plans[0].checks.eventTimeResolved).toBe(true);

    // Dry-run path performs NO writes.
    expect(updateMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("treats a row whose new value equals current as a no-op", async () => {
    const { db } = makeDb({
      pageTemplate: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "tpl", categoryId: null, customHtml: "<tpl/>" }]),
      },
      landingPage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "lp-old",
            workshopId: "ws1",
            // contains literal token so it IS a target, but reinterpolate
            // returns the SAME bytes → no-op.
            customHtml: "before {{event_time}} after",
            updatedAt: new Date(),
            categoryId: null,
          },
        ]),
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    });
    const reinterpolate = jest
      .fn()
      .mockResolvedValue(CLEAN_SANITIZE("before {{event_time}} after"));
    const plans = await buildPlans(db, reinterpolate);
    expect(plans).toHaveLength(1);
    expect(plans[0].isNoOp).toBe(true);
  });

  it("throws when no SOLO_LANDING template has customHtml", async () => {
    const { db } = makeDb({
      pageTemplate: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([]) // active query
          .mockResolvedValueOnce([{ id: "tpl", categoryId: null, customHtml: "" }]), // all query
      },
    });
    await expect(buildPlans(db, jest.fn())).rejects.toThrow(/non-empty customHtml/);
  });
});

describe("applyPlans", () => {
  it("writes via CAS (where includes updatedAt) + creates a backup first", async () => {
    const { db, updateMany } = makeDb();
    const oldUpdatedAt = new Date("2026-01-01T00:00:00Z");
    const plan = planRow({
      landingPageId: "lp-old",
      workshopId: "ws1",
      oldCustomHtml: OLD_LOGO_HTML,
      newCustomHtml: NEW_LOGO_HTML,
      oldUpdatedAt,
      strippedTags: [],
      strippedAttrs: [],
    });

    const writeBackup = jest.fn().mockResolvedValue("/tmp/backup.json");
    const result = await applyPlans(db, [plan], { writeBackup });

    // Backup happens BEFORE the write.
    expect(writeBackup).toHaveBeenCalledTimes(1);
    expect(writeBackup).toHaveBeenCalledWith([plan]);
    expect(writeBackup.mock.invocationCallOrder[0]).toBeLessThan(
      updateMany.mock.invocationCallOrder[0],
    );

    // CAS: WHERE must include both id AND the captured updatedAt.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "lp-old", updatedAt: oldUpdatedAt },
      data: { customHtml: NEW_LOGO_HTML },
    });
    expect(result).toMatchObject({ updated: 1, skipped: 0, blocked: 0 });
    expect(result.backupFile).toBe("/tmp/backup.json");
  });

  it("CAS abort: updateMany count 0 → skipped, no throw, no clobber", async () => {
    const { db, updateMany } = makeDb();
    updateMany.mockResolvedValue({ count: 0 }); // concurrent edit
    const plan = planRow({
      landingPageId: "lp-old",
      workshopId: "ws1",
      oldCustomHtml: OLD_LOGO_HTML,
      newCustomHtml: NEW_LOGO_HTML,
      oldUpdatedAt: new Date(),
      strippedTags: [],
      strippedAttrs: [],
    });
    const writeBackup = jest.fn().mockResolvedValue("/tmp/b.json");
    const result = await applyPlans(db, [plan], { writeBackup });
    expect(result).toMatchObject({ updated: 0, skipped: 1, blocked: 0 });
  });

  it("blocks the whole apply (no writes) when any changing row had sanitizer strips", async () => {
    const { db, updateMany } = makeDb();
    const plan = planRow({
      landingPageId: "lp-old",
      workshopId: "ws1",
      oldCustomHtml: OLD_LOGO_HTML,
      newCustomHtml: NEW_LOGO_HTML,
      oldUpdatedAt: new Date(),
      strippedTags: [],
      strippedAttrs: ["onclick"],
    });
    const writeBackup = jest.fn();
    const result = await applyPlans(db, [plan], { writeBackup });
    expect(result.blocked).toBe(1);
    expect(writeBackup).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("no-op-only plans write nothing and create no backup", async () => {
    const { db, updateMany } = makeDb();
    const plan = planRow({
      landingPageId: "lp",
      workshopId: "ws",
      oldCustomHtml: NEW_LOGO_HTML,
      newCustomHtml: NEW_LOGO_HTML,
      oldUpdatedAt: new Date(),
      strippedTags: [],
      strippedAttrs: [],
    });
    const writeBackup = jest.fn();
    const result = await applyPlans(db, [plan], { writeBackup });
    expect(result).toEqual({ updated: 0, skipped: 0, blocked: 0 });
    expect(writeBackup).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("restoreFromBackup", () => {
  const backup: BackupFile = {
    kind: "solo-landing-customhtml-backfill",
    createdAt: new Date().toISOString(),
    databaseHost: "localhost",
    entries: [
      {
        landingPageId: "lp-old",
        workshopId: "ws1",
        oldCustomHtml: OLD_LOGO_HTML,
        oldUpdatedAt: new Date("2026-01-01T00:00:00Z").toISOString(),
        oldSha: sha256(OLD_LOGO_HTML),
        newSha: sha256(NEW_LOGO_HTML),
      },
    ],
  };

  it("restores old value when current value still matches the written newSha", async () => {
    const { db, update, findUnique } = makeDb();
    findUnique.mockResolvedValue({ customHtml: NEW_LOGO_HTML }); // unchanged since apply
    const result = await restoreFromBackup(db, backup);
    expect(update).toHaveBeenCalledWith({
      where: { id: "lp-old" },
      data: { customHtml: OLD_LOGO_HTML },
    });
    expect(result).toEqual({ restored: 1, skipped: 0 });
  });

  it("skips (no clobber) when current value was edited after our apply", async () => {
    const { db, update, findUnique } = makeDb();
    findUnique.mockResolvedValue({ customHtml: "SOMETHING ELSE EDITED LATER" });
    const result = await restoreFromBackup(db, backup);
    expect(update).not.toHaveBeenCalled();
    expect(result).toEqual({ restored: 0, skipped: 1 });
  });

  it("skips when the row no longer exists", async () => {
    const { db, update, findUnique } = makeDb();
    findUnique.mockResolvedValue(null);
    const result = await restoreFromBackup(db, backup);
    expect(update).not.toHaveBeenCalled();
    expect(result).toEqual({ restored: 0, skipped: 1 });
  });

  it("rejects a malformed backup file", async () => {
    const { db } = makeDb();
    await expect(
      restoreFromBackup(db, { kind: "nope" } as unknown as BackupFile),
    ).rejects.toThrow(/recognised backfill backup/);
  });
});

// ── Prod guard (shared with safe-seed) ───────────────────────────────────────

describe("prod-host guard blocks apply/restore without the flag", () => {
  const PROD_URL = "postgresql://u:p@ep-prod.neon.tech:5432/db";
  const DEV_URL = "postgresql://u:p@localhost:5432/db";

  it("BLOCKS a prod host without --i-know-this-is-prod", () => {
    const d = checkGuard({ url: PROD_URL, expectedHost: undefined, hasOverride: false });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/Neon\/prod/);
  });

  it("ALLOWS a prod host WITH the override flag", () => {
    const d = checkGuard({ url: PROD_URL, expectedHost: undefined, hasOverride: true });
    expect(d.allowed).toBe(true);
  });

  it("ALLOWS a dev host without the flag", () => {
    const d = checkGuard({ url: DEV_URL, expectedHost: undefined, hasOverride: false });
    expect(d.allowed).toBe(true);
  });
});
