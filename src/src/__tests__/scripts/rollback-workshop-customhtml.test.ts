/**
 * Tests for the per-workshop customHtml bulk rollback ops tool.
 *
 * The CLI (scripts/rollback-workshop-customhtml.mjs) reimplements the pure
 * planner inline in plain JS (node-can't-import-ts). The CANONICAL TS source
 * src/lib/scripts/rollback-workshop-customhtml-core.ts is what we test here —
 * any logic change must be mirrored in the .mjs (and vice versa).
 *
 * Coverage:
 *   (a) dry-run plan correctly identifies pages to RESTORE (target = state
 *       before the first in-window edit; folds multiple edits per page).
 *   (b) CAS-SKIP: a page whose current customHtml has diverged from the last
 *       in-window edit's newSha is SKIPPED + reported, not restored.
 *   + edge cases: missing page, single-window edit, no-op-on-no-rows,
 *     parseRollbackArgs.
 */

import {
  planRollback,
  parseRollbackArgs,
  sha256,
  type AuditRowInput,
  type CurrentPage,
} from "../../lib/scripts/rollback-workshop-customhtml-core";

const OVERRIDE_FLAG = "--i-know-this-is-prod";

/** Build a UPDATE_CUSTOM_HTML audit row with a JSON `changes` string. */
function auditRow(args: {
  id: string;
  entityId: string;
  performedBy?: string | null;
  timestamp: string;
  previousCustomHtml: string | null;
  newCustomHtml: string | null; // we derive newSha from this
  template?: string;
}): AuditRowInput {
  return {
    id: args.id,
    entityId: args.entityId,
    performedBy: args.performedBy ?? "admin@example.com",
    timestamp: args.timestamp,
    changes: JSON.stringify({
      op: "save",
      template: args.template ?? "SOLO_LANDING",
      previousCustomHtml: args.previousCustomHtml,
      prevSha: sha256(args.previousCustomHtml ?? ""),
      newSha: sha256(args.newCustomHtml ?? ""),
      newCustomHtmlLength: (args.newCustomHtml ?? "").length,
      actorRole: "ADMIN",
      sanitizerStripped: false,
    }),
  };
}

function page(args: {
  id: string;
  workshopId?: string;
  template?: string;
  customHtml: string | null;
}): CurrentPage {
  return {
    id: args.id,
    workshopId: args.workshopId ?? "ws_1",
    template: args.template ?? "SOLO_LANDING",
    customHtml: args.customHtml,
    status: "PUBLISHED",
  };
}

describe("planRollback — dry-run plan", () => {
  it("restores a page to the state BEFORE the first in-window edit (single edit)", () => {
    const rows: AuditRowInput[] = [
      auditRow({
        id: "a1",
        entityId: "lp_1",
        timestamp: "2026-06-12T10:00:00Z",
        previousCustomHtml: "<p>GOOD original</p>",
        newCustomHtml: "<p>BAD edit</p>",
      }),
    ];
    // Current state matches the last in-window write (the BAD edit) → eligible.
    const pages = new Map<string, CurrentPage>([
      ["lp_1", page({ id: "lp_1", customHtml: "<p>BAD edit</p>" })],
    ]);

    const plan = planRollback(rows, pages);

    expect(plan.totalPages).toBe(1);
    expect(plan.skippedDiverged).toHaveLength(0);
    expect(plan.toRestore).toHaveLength(1);
    const r = plan.toRestore[0];
    expect(r.landingPageId).toBe("lp_1");
    expect(r.targetCustomHtml).toBe("<p>GOOD original</p>");
    expect(r.expectedCurrentCustomHtml).toBe("<p>BAD edit</p>");
    expect(r.inWindowChangeCount).toBe(1);
  });

  it("folds MULTIPLE in-window edits per page: target = earliest previous, CAS = latest new", () => {
    const rows: AuditRowInput[] = [
      // out-of-order on purpose; planner sorts by timestamp.
      auditRow({
        id: "a2",
        entityId: "lp_1",
        timestamp: "2026-06-12T11:00:00Z",
        previousCustomHtml: "<p>BAD edit 1</p>",
        newCustomHtml: "<p>BAD edit 2 (final)</p>",
      }),
      auditRow({
        id: "a1",
        entityId: "lp_1",
        timestamp: "2026-06-12T10:00:00Z",
        previousCustomHtml: "<p>GOOD original</p>",
        newCustomHtml: "<p>BAD edit 1</p>",
      }),
    ];
    const pages = new Map<string, CurrentPage>([
      ["lp_1", page({ id: "lp_1", customHtml: "<p>BAD edit 2 (final)</p>" })],
    ]);

    const plan = planRollback(rows, pages);

    expect(plan.toRestore).toHaveLength(1);
    const r = plan.toRestore[0];
    expect(r.targetCustomHtml).toBe("<p>GOOD original</p>"); // before the window began
    expect(r.expectedCurrentCustomHtml).toBe("<p>BAD edit 2 (final)</p>"); // last write
    expect(r.inWindowChangeCount).toBe(2);
    expect(r.firstAuditId).toBe("a1");
    expect(r.lastAuditId).toBe("a2");
  });

  it("plans independently across multiple pages", () => {
    const rows: AuditRowInput[] = [
      auditRow({
        id: "a1",
        entityId: "lp_1",
        timestamp: "2026-06-12T10:00:00Z",
        previousCustomHtml: "<p>orig 1</p>",
        newCustomHtml: "<p>bad 1</p>",
      }),
      auditRow({
        id: "b1",
        entityId: "lp_2",
        timestamp: "2026-06-12T10:05:00Z",
        previousCustomHtml: null, // first-ever save → restoring clears it
        newCustomHtml: "<p>bad 2</p>",
      }),
    ];
    const pages = new Map<string, CurrentPage>([
      ["lp_1", page({ id: "lp_1", workshopId: "ws_1", customHtml: "<p>bad 1</p>" })],
      ["lp_2", page({ id: "lp_2", workshopId: "ws_2", customHtml: "<p>bad 2</p>" })],
    ]);

    const plan = planRollback(rows, pages);

    expect(plan.totalPages).toBe(2);
    expect(plan.toRestore).toHaveLength(2);
    const lp2 = plan.toRestore.find((r) => r.landingPageId === "lp_2");
    expect(lp2?.targetCustomHtml).toBeNull(); // restoring a first-save clears the override
  });
});

describe("planRollback — CAS skip on diverged pages", () => {
  it("SKIPS a page whose current customHtml diverged from the last in-window edit", () => {
    const rows: AuditRowInput[] = [
      auditRow({
        id: "a1",
        entityId: "lp_1",
        timestamp: "2026-06-12T10:00:00Z",
        previousCustomHtml: "<p>GOOD original</p>",
        newCustomHtml: "<p>BAD edit</p>",
      }),
    ];
    // Someone edited the page AFTER the window — current != last in-window write.
    const pages = new Map<string, CurrentPage>([
      ["lp_1", page({ id: "lp_1", customHtml: "<p>LEGIT later edit (do not clobber)</p>" })],
    ]);

    const plan = planRollback(rows, pages);

    expect(plan.toRestore).toHaveLength(0);
    expect(plan.skippedDiverged).toHaveLength(1);
    const s = plan.skippedDiverged[0];
    expect(s.landingPageId).toBe("lp_1");
    expect(s.reason).toBe("diverged");
    expect(s.currentSha).toBe(sha256("<p>LEGIT later edit (do not clobber)</p>"));
    expect(s.expectedSha).toBe(sha256("<p>BAD edit</p>"));
  });

  it("mixed batch: restores the in-sync page, skips the diverged one", () => {
    const rows: AuditRowInput[] = [
      auditRow({
        id: "a1",
        entityId: "lp_ok",
        timestamp: "2026-06-12T10:00:00Z",
        previousCustomHtml: "<p>orig ok</p>",
        newCustomHtml: "<p>bad ok</p>",
      }),
      auditRow({
        id: "b1",
        entityId: "lp_div",
        timestamp: "2026-06-12T10:01:00Z",
        previousCustomHtml: "<p>orig div</p>",
        newCustomHtml: "<p>bad div</p>",
      }),
    ];
    const pages = new Map<string, CurrentPage>([
      ["lp_ok", page({ id: "lp_ok", customHtml: "<p>bad ok</p>" })], // in sync
      ["lp_div", page({ id: "lp_div", customHtml: "<p>edited after window</p>" })], // diverged
    ]);

    const plan = planRollback(rows, pages);

    expect(plan.toRestore.map((r) => r.landingPageId)).toEqual(["lp_ok"]);
    expect(plan.skippedDiverged.map((s) => s.landingPageId)).toEqual(["lp_div"]);
  });

  it("skips a page that no longer exists (missing-page)", () => {
    const rows: AuditRowInput[] = [
      auditRow({
        id: "a1",
        entityId: "lp_gone",
        timestamp: "2026-06-12T10:00:00Z",
        previousCustomHtml: "<p>orig</p>",
        newCustomHtml: "<p>bad</p>",
      }),
    ];
    const plan = planRollback(rows, new Map());
    expect(plan.toRestore).toHaveLength(0);
    expect(plan.skippedDiverged[0].reason).toBe("missing-page");
  });

  it("accepts a plain object map as well as a Map", () => {
    const rows: AuditRowInput[] = [
      auditRow({
        id: "a1",
        entityId: "lp_1",
        timestamp: "2026-06-12T10:00:00Z",
        previousCustomHtml: "<p>orig</p>",
        newCustomHtml: "<p>bad</p>",
      }),
    ];
    const plan = planRollback(rows, { lp_1: page({ id: "lp_1", customHtml: "<p>bad</p>" }) });
    expect(plan.toRestore).toHaveLength(1);
  });

  it("returns an empty plan when there are no audit rows", () => {
    const plan = planRollback([], new Map());
    expect(plan).toEqual({ toRestore: [], skippedDiverged: [], totalPages: 0 });
  });
});

describe("parseRollbackArgs", () => {
  it("defaults to dry-run (no --apply) and no override", () => {
    const a = parseRollbackArgs([], OVERRIDE_FLAG);
    expect(a.apply).toBe(false);
    expect(a.hasOverride).toBe(false);
    expect(a.help).toBe(false);
  });

  it("parses window / actor / workshop filters (space form)", () => {
    const a = parseRollbackArgs(
      ["--since", "2026-06-12T00:00:00Z", "--until", "2026-06-13T00:00:00Z", "--actor", "x@y.com", "--workshop", "ws_9"],
      OVERRIDE_FLAG
    );
    expect(a.since).toBe("2026-06-12T00:00:00Z");
    expect(a.until).toBe("2026-06-13T00:00:00Z");
    expect(a.actor).toBe("x@y.com");
    expect(a.workshop).toBe("ws_9");
  });

  it("parses the --key=value form", () => {
    const a = parseRollbackArgs(["--actor=ops@y.com", "--workshop=ws_5"], OVERRIDE_FLAG);
    expect(a.actor).toBe("ops@y.com");
    expect(a.workshop).toBe("ws_5");
  });

  it("recognizes --apply and the prod override flag", () => {
    const a = parseRollbackArgs(["--apply", OVERRIDE_FLAG], OVERRIDE_FLAG);
    expect(a.apply).toBe(true);
    expect(a.hasOverride).toBe(true);
  });

  it("recognizes --help / -h", () => {
    expect(parseRollbackArgs(["--help"], OVERRIDE_FLAG).help).toBe(true);
    expect(parseRollbackArgs(["-h"], OVERRIDE_FLAG).help).toBe(true);
  });
});
