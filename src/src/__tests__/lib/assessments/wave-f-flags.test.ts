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
  groupReportRequiresPublishedVersion,
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

describe("isGroupReportAlias (allowlisted group-report surfaces)", () => {
  it("allowlist includes the four existing types plus Five Dysfunctions", () => {
    expect(GROUP_REPORT_ALIASES).toEqual([
      "leadership-vision-alignment",
      "scaling-up-full",
      "qsp-v2",
      "RockHabits",
      "five-dysfunctions",
    ]);
  });

  it("ship-dark drift guard: with WAVE_F ON, ONLY LVA rides it — every other surfaced alias must be gated by its own default-OFF flag", () => {
    // Review finding (#72): WAVE_F_GROUP_REPORT_ENABLED is ON in prod. The
    // routing Set and the allowlist array are two lists of aliases; if a future
    // alias is added to the allowlist but its flag routing is forgotten, it
    // falls through to the WAVE_F path and would surface the instant it merges —
    // inverting the ship-dark intent. This couples the two: LVA is the ONLY
    // allowlisted alias WAVE_F may enable; anything else must return false here.
    process.env[GLOBAL] = "1"; // WAVE_F on
    // type-specific flags explicitly OFF (order-independent)
    delete process.env.WAVE_J_SUFULL_GROUP_ENABLED;
    delete process.env.WAVE_J_SUFULL_GROUP_CANARY;
    delete process.env.WAVE_QSP_ROCK_GROUP_REPORT_ENABLED;
    delete process.env.WAVE_QSP_ROCK_GROUP_REPORT_CANARY;
    delete process.env.WAVE_5D_GROUP_REPORT_ENABLED;
    delete process.env.WAVE_5D_GROUP_REPORT_CANARY;
    for (const alias of GROUP_REPORT_ALIASES) {
      const enabled = isGroupReportEnabled(null, {
        id: "camp-drift",
        template: { alias },
      });
      if (alias === "leadership-vision-alignment") {
        expect(enabled).toBe(true);
      } else {
        expect(enabled).toBe(false);
      }
    }
  });

  it("returns true for the LVA alias", () => {
    expect(isGroupReportAlias("leadership-vision-alignment")).toBe(true);
  });

  it("returns true for the SU-Full alias (Wave J J-3 — added atomically with the gates)", () => {
    expect(isGroupReportAlias("scaling-up-full")).toBe(true);
  });

  it("returns true for the QSP-v2 alias (#72 / DT-5)", () => {
    expect(isGroupReportAlias("qsp-v2")).toBe(true);
  });

  it("returns true for the Rockefeller alias (#72 / DT-5)", () => {
    expect(isGroupReportAlias("RockHabits")).toBe(true);
  });

  it("returns true for Five Dysfunctions (Jeff 2026-09-01)", () => {
    expect(isGroupReportAlias("five-dysfunctions")).toBe(true);
  });

  it("returns false for the retired QSP-v1 alias (only v2 is surfaced)", () => {
    expect(isGroupReportAlias("qsp-v1")).toBe(false);
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
    const suf = { template: { alias: "scaling-up-full" } };
    const lva = { template: { alias: "leadership-vision-alignment" } };
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
    expect(isGroupReportEnabled({ coachId: "coach-1" }, suf)).toBe(false);
  });

  it("SU-Full canary accepts campaign.id", () => {
    const suf = { id: "camp-suf", template: { alias: "scaling-up-full" } };
    process.env[SUF_CANARY] = "camp-suf";
    delete process.env[SUF_GLOBAL];
    delete process.env[SUF_KILL];
    expect(isGroupReportEnabled(null, suf)).toBe(true);
  });

  it("SU-Full canary: coach id does NOT match (campaign-id-only)", () => {
    const suf = { id: "camp-suf", template: { alias: "scaling-up-full" } };
    process.env[SUF_CANARY] = "coach-allowed";
    delete process.env[SUF_GLOBAL];
    delete process.env[SUF_KILL];
    expect(isGroupReportEnabled({ coachId: "coach-allowed" }, suf)).toBe(false);
  });

  it("SU-Full canary: org id does NOT match (campaign-id-only)", () => {
    const suf = { id: "camp-suf", organizationId: "org-allowed", template: { alias: "scaling-up-full" } };
    process.env[SUF_CANARY] = "org-allowed";
    delete process.env[SUF_GLOBAL];
    delete process.env[SUF_KILL];
    expect(isGroupReportEnabled(null, suf)).toBe(false);
  });

  it("SU-Full canary: createdByCoachId does NOT match (campaign-id-only)", () => {
    const suf = { id: "camp-suf", createdByCoachId: "coach-creator", template: { alias: "scaling-up-full" } };
    process.env[SUF_CANARY] = "coach-creator";
    delete process.env[SUF_GLOBAL];
    delete process.env[SUF_KILL];
    expect(isGroupReportEnabled(null, suf)).toBe(false);
  });

  it("WAVE_J_SUFULL_GROUP_KILL does not affect LVA", () => {
    const lva = { template: { alias: "leadership-vision-alignment" } };
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
    process.env[SUF_KILL] = "1";
    expect(isGroupReportEnabled(null, lva)).toBe(true);
  });

  it("SU-Full is default-OFF (no env vars set)", () => {
    const suf = { id: "camp-suf", template: { alias: "scaling-up-full" } };
    delete process.env[SUF_GLOBAL];
    delete process.env[SUF_CANARY];
    delete process.env[SUF_KILL];
    expect(isGroupReportEnabled(null, suf)).toBe(false);
  });

  it("a non-special alias (not SU-Full / QSP / Rockefeller) still uses the WAVE_F path", () => {
    // qsp-v1 is retired and NOT one of the #72 surfaced aliases → falls through
    // to the original Wave F behaviour.
    const other = { id: "camp-r", template: { alias: "qsp-v1" } };
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
    expect(isGroupReportEnabled(null, other)).toBe(true);
  });

  it("null template alias falls through to WAVE_F path", () => {
    const noAlias = { id: "camp-x", template: null };
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
    expect(isGroupReportEnabled(null, noAlias)).toBe(true);
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "0";
    expect(isGroupReportEnabled(null, noAlias)).toBe(false);
  });
});

// ─── #72 / DT-5: QSP + Rockefeller independent flag (ships dark under WAVE_F-on) ───

const DT5_GLOBAL = "WAVE_QSP_ROCK_GROUP_REPORT_ENABLED";
const DT5_CANARY = "WAVE_QSP_ROCK_GROUP_REPORT_CANARY";
const DT5_KILL = "WAVE_QSP_ROCK_GROUP_REPORT_KILL";

describe("QSP + Rockefeller group-report expansion flag (#72 / DT-5)", () => {
  afterEach(() => {
    delete process.env[DT5_GLOBAL];
    delete process.env[DT5_CANARY];
    delete process.env[DT5_KILL];
  });

  const qsp = { id: "camp-q", template: { alias: "qsp-v2" } };
  const rock = { id: "camp-r", template: { alias: "RockHabits" } };
  const lva = { template: { alias: "leadership-vision-alignment" } };
  const suf = { template: { alias: "scaling-up-full" } };

  it("QSP + Rockefeller are default-OFF when no DT-5 env vars are set", () => {
    expect(isGroupReportEnabled(null, qsp)).toBe(false);
    expect(isGroupReportEnabled(null, rock)).toBe(false);
  });

  it("QSP + Rockefeller stay OFF even when WAVE_F is ON (they ship dark independently)", () => {
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
    try {
      expect(isGroupReportEnabled(null, qsp)).toBe(false);
      expect(isGroupReportEnabled(null, rock)).toBe(false);
      // LVA (Wave F) is still ON — proving the split.
      expect(isGroupReportEnabled(null, lva)).toBe(true);
    } finally {
      delete process.env.WAVE_F_GROUP_REPORT_ENABLED;
    }
  });

  it("DT-5 global ON enables BOTH QSP and Rockefeller", () => {
    process.env[DT5_GLOBAL] = "1";
    expect(isGroupReportEnabled(null, qsp)).toBe(true);
    expect(isGroupReportEnabled(null, rock)).toBe(true);
  });

  it("DT-5 canary matches campaign.id only (bulk-PII: not coach/org/createdBy)", () => {
    process.env[DT5_CANARY] = "camp-r";
    expect(isGroupReportEnabled(null, rock)).toBe(true);
    // coach / org / createdBy identifiers must NOT match (campaign-id-only)
    process.env[DT5_CANARY] = "coach-x";
    expect(
      isGroupReportEnabled(
        { coachId: "coach-x" },
        { id: "camp-r", createdByCoachId: "coach-x", organizationId: "coach-x", template: { alias: "RockHabits" } }
      )
    ).toBe(false);
  });

  it("DT-5 KILL hard-overrides a matching canary", () => {
    process.env[DT5_CANARY] = "camp-q";
    process.env[DT5_KILL] = "1";
    expect(isGroupReportEnabled(null, qsp)).toBe(false);
  });

  it("DT-5 flags do NOT affect LVA (Wave F) or SU-Full (Wave J)", () => {
    process.env[DT5_GLOBAL] = "1";
    expect(isGroupReportEnabled(null, lva)).toBe(false); // WAVE_F still off
    expect(isGroupReportEnabled(null, suf)).toBe(false); // WAVE_J still off
  });
});

// ─── #427: Five Dysfunctions independent flag (ships dark under WAVE_F-on) ───

const FIVE_D_GLOBAL = "WAVE_5D_GROUP_REPORT_ENABLED";
const FIVE_D_CANARY = "WAVE_5D_GROUP_REPORT_CANARY";
const FIVE_D_KILL = "WAVE_5D_GROUP_REPORT_KILL";

describe("Five Dysfunctions group-report flag (#427)", () => {
  afterEach(() => {
    delete process.env[FIVE_D_GLOBAL];
    delete process.env[FIVE_D_CANARY];
    delete process.env[FIVE_D_KILL];
  });

  const fiveD = {
    id: "camp-5d",
    createdByCoachId: "coach-5d",
    organizationId: "org-5d",
    template: { alias: "five-dysfunctions" },
  };

  it("is enabled by its own enabled flag", () => {
    process.env[FIVE_D_GLOBAL] = "1";
    expect(isGroupReportEnabled(null, fiveD)).toBe(true);
  });

  it("kill overrides both the enabled flag and a matching canary", () => {
    process.env[FIVE_D_GLOBAL] = "1";
    process.env[FIVE_D_CANARY] = "camp-5d";
    process.env[FIVE_D_KILL] = "1";
    expect(isGroupReportEnabled(null, fiveD)).toBe(false);
  });

  it("canary matches campaign id only, not coach or organization ids", () => {
    process.env[FIVE_D_CANARY] = "camp-5d";
    expect(isGroupReportEnabled({ coachId: "coach-5d" }, fiveD)).toBe(true);

    process.env[FIVE_D_CANARY] = "coach-5d,org-5d";
    expect(isGroupReportEnabled({ coachId: "coach-5d" }, fiveD)).toBe(false);
  });

  it("stays off with WAVE_F enabled when its own flags are unset", () => {
    process.env[GLOBAL] = "1";
    expect(isGroupReportEnabled(null, fiveD)).toBe(false);
  });
});

// ─── publish guard generalized to scored group reports (R3-H1) ─────────────────

describe("groupReportRequiresPublishedVersion (scored → must be published)", () => {
  it("qualitative surfaces (LVA, QSP) do NOT require a published version", () => {
    expect(groupReportRequiresPublishedVersion("leadership-vision-alignment")).toBe(false);
    expect(groupReportRequiresPublishedVersion("qsp-v2")).toBe(false);
  });

  it("scored surfaces (SU-Full, Rockefeller) DO require a published version", () => {
    expect(groupReportRequiresPublishedVersion("scaling-up-full")).toBe(true);
    expect(groupReportRequiresPublishedVersion("RockHabits")).toBe(true);
  });

  it("fails closed for null / unknown alias (default report config is scored)", () => {
    expect(groupReportRequiresPublishedVersion(null)).toBe(true);
    expect(groupReportRequiresPublishedVersion(undefined)).toBe(true);
    expect(groupReportRequiresPublishedVersion("mystery-alias")).toBe(true);
  });
});
