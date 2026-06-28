/**
 * Wave F group-report feature flag — TDD test suite.
 *
 * Mirrors the Wave-D flag truthiness convention
 * (`@/lib/assessments/wave-d-feature-flags`):
 *   - Default-OFF (false) when unset / "" / "0" / "false"
 *   - ON (true) only for "1" / "true" / "TRUE" / "yes"
 *
 * `isGroupReportEnabled()` gates a bulk-PII surface (claudex R3-HIGH-2):
 * a default-OFF global flag PLUS a comma-separated canary allowlist that
 * matches a coach / org / campaign identifier so individual coaches or
 * campaigns can be canaried while the global flag stays off.
 */

import {
  isGroupReportEnabled,
  isGroupReportAlias,
  GROUP_REPORT_ALIASES,
} from "@/lib/assessments/wave-f-flags";

const GLOBAL = "WAVE_F_GROUP_REPORT_ENABLED";
const CANARY = "WAVE_F_GROUP_REPORT_CANARY";

afterEach(() => {
  // Tests must not leak env state.
  delete process.env[GLOBAL];
  delete process.env[CANARY];
});

// ─── default OFF ──────────────────────────────────────────────────────────

describe("default OFF", () => {
  it("returns false when no env vars are set", () => {
    expect(
      isGroupReportEnabled(
        { coachId: "coach-1" },
        { id: "camp-1", createdByCoachId: "coach-1", organizationId: "org-1" }
      )
    ).toBe(false);
  });

  it("returns false for null actor and null campaign with no env", () => {
    expect(isGroupReportEnabled(null, null)).toBe(false);
  });

  it.each([undefined, "", "0", "false", "FALSE", "no"])(
    "returns false when global flag is %p (no canary)",
    (value) => {
      if (value === undefined) delete process.env[GLOBAL];
      else process.env[GLOBAL] = value;
      expect(
        isGroupReportEnabled(
          { coachId: "coach-1" },
          { id: "camp-1", createdByCoachId: "coach-1", organizationId: "org-1" }
        )
      ).toBe(false);
    }
  );
});

// ─── global flag ON ─────────────────────────────────────────────────────────

describe("global flag ON", () => {
  it.each(["1", "true", "TRUE", "yes"])(
    "returns true when global flag is %p",
    (value) => {
      process.env[GLOBAL] = value;
      expect(
        isGroupReportEnabled(
          { coachId: "coach-x" },
          { id: "camp-x", createdByCoachId: "coach-y", organizationId: "org-z" }
        )
      ).toBe(true);
    }
  );

  it("returns true with global ON even when actor and campaign are null", () => {
    process.env[GLOBAL] = "1";
    expect(isGroupReportEnabled(null, null)).toBe(true);
  });
});

// ─── canary allowlist (global OFF) ────────────────────────────────────────────

describe("canary allowlist while global flag OFF", () => {
  it("matches a listed actor.coachId", () => {
    process.env[CANARY] = "coach-allowed,coach-other";
    expect(
      isGroupReportEnabled(
        { coachId: "coach-allowed" },
        { id: "camp-1", createdByCoachId: null, organizationId: null }
      )
    ).toBe(true);
  });

  it("does not match a non-listed coachId", () => {
    process.env[CANARY] = "coach-allowed";
    expect(
      isGroupReportEnabled(
        { coachId: "coach-denied" },
        { id: "camp-1", createdByCoachId: null, organizationId: null }
      )
    ).toBe(false);
  });

  it("matches by campaign.createdByCoachId", () => {
    process.env[CANARY] = "coach-creator";
    expect(
      isGroupReportEnabled(
        { coachId: "someone-else" },
        { id: "camp-1", createdByCoachId: "coach-creator", organizationId: null }
      )
    ).toBe(true);
  });

  it("matches by campaign.organizationId", () => {
    process.env[CANARY] = "org-allowed";
    expect(
      isGroupReportEnabled(
        { coachId: null },
        { id: "camp-1", createdByCoachId: null, organizationId: "org-allowed" }
      )
    ).toBe(true);
  });

  it("matches by campaign.id", () => {
    process.env[CANARY] = "camp-allowed";
    expect(
      isGroupReportEnabled(
        { coachId: null },
        { id: "camp-allowed", createdByCoachId: null, organizationId: null }
      )
    ).toBe(true);
  });

  it("tolerates whitespace in the allowlist", () => {
    process.env[CANARY] = "  coach-a , org-b ,  camp-c  ";
    expect(
      isGroupReportEnabled(
        { coachId: null },
        { id: "camp-1", createdByCoachId: null, organizationId: "org-b" }
      )
    ).toBe(true);
  });

  it("ignores empty allowlist entries", () => {
    process.env[CANARY] = ",,  ,";
    expect(
      isGroupReportEnabled(
        { coachId: "" },
        { id: "", createdByCoachId: "", organizationId: "" }
      )
    ).toBe(false);
  });

  it("returns false on empty canary string", () => {
    process.env[CANARY] = "";
    expect(
      isGroupReportEnabled(
        { coachId: "coach-1" },
        { id: "camp-1", createdByCoachId: "coach-1", organizationId: "org-1" }
      )
    ).toBe(false);
  });
});

// ─── never throws on missing fields ───────────────────────────────────────────

describe("null / undefined safety", () => {
  it("does not throw and returns false when both args are null and canary is set", () => {
    process.env[CANARY] = "coach-allowed";
    expect(isGroupReportEnabled(null, null)).toBe(false);
  });

  it("treats missing actor fields as non-matching", () => {
    process.env[CANARY] = "coach-allowed";
    expect(
      isGroupReportEnabled(
        {},
        { id: "camp-1" }
      )
    ).toBe(false);
  });

  it("matches campaign id even when actor is null", () => {
    process.env[CANARY] = "camp-allowed";
    expect(isGroupReportEnabled(null, { id: "camp-allowed" })).toBe(true);
  });
});

describe("isGroupReportAlias (LVA-only surface — Jeff 2026-06-18)", () => {
  it("allowlist is exactly the LVA alias", () => {
    expect(GROUP_REPORT_ALIASES).toEqual(["leadership-vision-alignment"]);
  });

  it("returns true for the LVA alias", () => {
    expect(isGroupReportAlias("leadership-vision-alignment")).toBe(true);
  });

  it("returns false for scored templates (not surfaced)", () => {
    expect(isGroupReportAlias("RockHabits")).toBe(false);
    expect(isGroupReportAlias("five-dysfunctions")).toBe(false);
    expect(isGroupReportAlias("scaling-up-full")).toBe(false);
  });

  it("returns false for other qualitative templates (LVA only for now)", () => {
    expect(isGroupReportAlias("qsp-v1")).toBe(false);
    expect(isGroupReportAlias("qsp-v2")).toBe(false);
  });

  it("returns false for null/undefined/empty", () => {
    expect(isGroupReportAlias(null)).toBe(false);
    expect(isGroupReportAlias(undefined)).toBe(false);
    expect(isGroupReportAlias("")).toBe(false);
  });
});

// ─── Task 1: SU-Full independent flag + kill precedence + campaign-id-only canary ───

const SUF_GLOBAL = "WAVE_J_SUFULL_GROUP_ENABLED";
const SUF_CANARY = "WAVE_J_SUFULL_GROUP_CANARY";
const SUF_KILL   = "WAVE_J_SUFULL_GROUP_KILL";

describe("SU-Full independent flag (Task 1)", () => {
  afterEach(() => {
    delete process.env[SUF_GLOBAL];
    delete process.env[SUF_CANARY];
    delete process.env[SUF_KILL];
  });

  it("SU-Full enablement is independent of LVA + has kill precedence over canary", () => {
    const suf = { template: { alias: "scaling-up-full" } } as any;
    const lva = { template: { alias: "leadership-vision-alignment" } } as any;
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
    delete process.env[SUF_GLOBAL];
    delete process.env[SUF_CANARY];
    delete process.env[SUF_KILL];
    expect(isGroupReportEnabled(null, lva)).toBe(true);
    expect(isGroupReportEnabled(null, suf)).toBe(false);  // LVA-on ≠ SU-Full-on
    process.env[SUF_GLOBAL] = "1";
    expect(isGroupReportEnabled(null, suf)).toBe(true);
    process.env[SUF_GLOBAL] = "0";                        // SU-Full global off
    expect(isGroupReportEnabled(null, suf)).toBe(false);
    expect(isGroupReportEnabled(null, lva)).toBe(true);   // LVA unaffected
    // kill precedence: a stale canary must NOT bypass the kill switch
    process.env[SUF_CANARY] = "coach-1";
    process.env[SUF_KILL] = "1";
    expect(isGroupReportEnabled({ coachId: "coach-1" } as any, suf)).toBe(false);
  });

  it("SU-Full canary accepts campaign.id", () => {
    const suf = { id: "camp-suf", template: { alias: "scaling-up-full" } } as any;
    process.env[SUF_CANARY] = "camp-suf";
    delete process.env[SUF_GLOBAL];
    delete process.env[SUF_KILL];
    expect(isGroupReportEnabled(null, suf)).toBe(true);
  });

  it("SU-Full canary: coach id does NOT match (campaign-id-only)", () => {
    const suf = { id: "camp-suf", template: { alias: "scaling-up-full" } } as any;
    process.env[SUF_CANARY] = "coach-allowed";
    delete process.env[SUF_GLOBAL];
    delete process.env[SUF_KILL];
    expect(isGroupReportEnabled({ coachId: "coach-allowed" } as any, suf)).toBe(false);
  });

  it("SU-Full canary: org id does NOT match (campaign-id-only)", () => {
    const suf = { id: "camp-suf", organizationId: "org-allowed", template: { alias: "scaling-up-full" } } as any;
    process.env[SUF_CANARY] = "org-allowed";
    delete process.env[SUF_GLOBAL];
    delete process.env[SUF_KILL];
    expect(isGroupReportEnabled(null, suf)).toBe(false);
  });

  it("SU-Full canary: createdByCoachId does NOT match (campaign-id-only)", () => {
    const suf = { id: "camp-suf", createdByCoachId: "coach-creator", template: { alias: "scaling-up-full" } } as any;
    process.env[SUF_CANARY] = "coach-creator";
    delete process.env[SUF_GLOBAL];
    delete process.env[SUF_KILL];
    expect(isGroupReportEnabled(null, suf)).toBe(false);
  });

  it("WAVE_J_SUFULL_GROUP_KILL does not affect LVA", () => {
    const lva = { template: { alias: "leadership-vision-alignment" } } as any;
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
    process.env[SUF_KILL] = "1";
    expect(isGroupReportEnabled(null, lva)).toBe(true);
  });

  it("SU-Full is default-OFF (no env vars set)", () => {
    const suf = { id: "camp-suf", template: { alias: "scaling-up-full" } } as any;
    delete process.env[SUF_GLOBAL];
    delete process.env[SUF_CANARY];
    delete process.env[SUF_KILL];
    expect(isGroupReportEnabled(null, suf)).toBe(false);
  });

  it("non-SU-Full non-LVA alias still uses WAVE_F path", () => {
    const rock = { id: "camp-r", template: { alias: "RockHabits" } } as any;
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
    expect(isGroupReportEnabled(null, rock)).toBe(true);
  });

  it("null template alias falls through to WAVE_F path", () => {
    const noAlias = { id: "camp-x", template: null } as any;
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
    expect(isGroupReportEnabled(null, noAlias)).toBe(true);
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "0";
    expect(isGroupReportEnabled(null, noAlias)).toBe(false);
  });
});
