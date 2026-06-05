/**
 * Esperto historical import — roster-plan (PURE) unit tests.
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §5 (roster);
 * plan 12a step 7, S1, edges 14 + 14b.
 *
 * buildRosterImportPlan is pure (no DB). It takes the parsed Members rows + the
 * caller-resolved existing org/respondents and produces a create/backfill/skip/
 * block plan. These tests lock: the field map (incl. "—" lastName fallback +
 * level→roleType passthrough), testuser/inactive skips, the three match outcomes
 * (new / match-by-externalId / match-by-email-backfill), the resolver-split
 * block (edge 14b), and the in-file duplicate-memberid / duplicate-email blocks
 * (edge 14).
 */

import { readFileSync } from "fs";
import { join } from "path";

import { buildRosterImportPlan } from "../../../../lib/assessments/esperto-import/roster-plan";
import { parseEspertoExport } from "../../../../lib/assessments/esperto-import/parse";
import type { EspertoMember } from "../../../../lib/assessments/esperto-import/types";

const FIX_DIR = join(__dirname, "fixtures");

function loadMembers(): EspertoMember[] {
  const json = JSON.parse(readFileSync(join(FIX_DIR, "members.json"), "utf8"));
  const parsed = parseEspertoExport(json);
  if (parsed.kind !== "members") throw new Error("fixture is not members");
  return parsed.data;
}

/** A minimal member row factory for targeted cases. */
function member(overrides: Partial<EspertoMember> = {}): EspertoMember {
  return {
    memberid: "M1",
    title: "CEO",
    firstname: "Jane",
    middlename: "",
    lastname: "Doe",
    email: "jane@example.com",
    status: "active",
    level: "ceofounderwithteam",
    testuser: false,
    extra: [],
    ...overrides,
  };
}

const OWNER = "coach-1";
const COMPANY = "Acme Corp";

describe("buildRosterImportPlan — field map", () => {
  it("maps every Esperto field onto our OrgRespondent shape", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [member()],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: { orgId: null, respondents: [] },
    });

    expect(plan.creates).toHaveLength(1);
    const c = plan.creates[0];
    expect(c.email).toBe("jane@example.com");
    expect(c.normalizedEmail).toBe("jane@example.com");
    expect(c.firstName).toBe("Jane");
    expect(c.lastName).toBe("Doe");
    expect(c.jobTitle).toBe("CEO");
    expect(c.roleType).toBe("ceofounderwithteam");
    expect(c.externalId).toBe("M1");
    expect(c.dedupeSource).toBe("external");
    expect(c.dedupeValue).toBe("M1");
  });

  it("normalizes email (lowercase + trim)", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [member({ email: "  Jane.Doe@Example.COM  " })],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: { orgId: null, respondents: [] },
    });
    expect(plan.creates[0].normalizedEmail).toBe("jane.doe@example.com");
    // Raw email preserved verbatim (only normalizedEmail is lowercased).
    expect(plan.creates[0].email).toBe("  Jane.Doe@Example.COM  ");
  });

  it('falls back to "—" when lastname is empty', () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [member({ lastname: "" })],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: { orgId: null, respondents: [] },
    });
    expect(plan.creates[0].lastName).toBe("—");
  });

  it("passes an unknown level slug through to roleType unchanged", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [member({ level: "some-legacy-slug" })],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: { orgId: null, respondents: [] },
    });
    expect(plan.creates[0].roleType).toBe("some-legacy-slug");
  });

  it("orgAction=create when no existing org id is supplied", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [member()],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: { orgId: null, respondents: [] },
    });
    expect(plan.orgAction).toBe("create");
    expect(plan.orgId).toBeUndefined();
    expect(plan.companyName).toBe(COMPANY);
    expect(plan.ownerCoachId).toBe(OWNER);
  });

  it("orgAction=match when an existing org id is supplied", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [member()],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: { orgId: "org-1", respondents: [] },
    });
    expect(plan.orgAction).toBe("match");
    expect(plan.orgId).toBe("org-1");
  });
});

describe("buildRosterImportPlan — filters", () => {
  it("skips testuser===true with reason 'testuser'", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [member({ memberid: "T1", testuser: true })],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: { orgId: null, respondents: [] },
    });
    expect(plan.creates).toHaveLength(0);
    expect(plan.skips).toEqual([{ memberid: "T1", reason: "testuser" }]);
  });

  it("skips status!=='active' with reason 'inactive'", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [member({ memberid: "I1", status: "disabled" })],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: { orgId: null, respondents: [] },
    });
    expect(plan.creates).toHaveLength(0);
    expect(plan.skips).toEqual([{ memberid: "I1", reason: "inactive" }]);
  });

  it("testuser takes precedence over an also-inactive row (one skip)", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [member({ memberid: "X1", testuser: true, status: "x" })],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: { orgId: null, respondents: [] },
    });
    expect(plan.skips).toEqual([{ memberid: "X1", reason: "testuser" }]);
  });
});

describe("buildRosterImportPlan — match / merge", () => {
  it("creates a brand-new respondent when nothing matches", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [member({ memberid: "M9", email: "new@example.com" })],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: { orgId: "org-1", respondents: [] },
    });
    expect(plan.creates).toHaveLength(1);
    expect(plan.backfills).toHaveLength(0);
  });

  it("matches an existing row by externalId → no create, no backfill", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [member({ memberid: "M1", email: "jane@example.com" })],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: {
        orgId: "org-1",
        respondents: [
          { id: "r1", externalId: "M1", normalizedEmail: "jane@example.com" },
        ],
      },
    });
    expect(plan.creates).toHaveLength(0);
    expect(plan.backfills).toHaveLength(0);
    expect(plan.blocks).toHaveLength(0);
  });

  it("matches by email and backfills externalId onto a hand-created row", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [member({ memberid: "M1", email: "jane@example.com" })],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: {
        orgId: "org-1",
        respondents: [
          { id: "r1", externalId: null, normalizedEmail: "jane@example.com" },
        ],
      },
    });
    expect(plan.creates).toHaveLength(0);
    expect(plan.backfills).toEqual([{ id: "r1", externalId: "M1" }]);
    expect(plan.blocks).toHaveLength(0);
  });
});

describe("buildRosterImportPlan — resolver-split block (edge 14b)", () => {
  it("blocks when an email match already carries a CONFLICTING externalId", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [member({ memberid: "M1", email: "jane@example.com" })],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: {
        orgId: "org-1",
        respondents: [
          { id: "r1", externalId: "OTHER", normalizedEmail: "jane@example.com" },
        ],
      },
    });
    expect(plan.creates).toHaveLength(0);
    expect(plan.backfills).toHaveLength(0);
    expect(plan.blocks).toEqual([{ memberid: "M1", reason: "resolver-split" }]);
  });

  it("blocks when externalId-match and email-match are DIFFERENT rows", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [member({ memberid: "M1", email: "jane@example.com" })],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: {
        orgId: "org-1",
        respondents: [
          { id: "r1", externalId: "M1", normalizedEmail: "someone@example.com" },
          { id: "r2", externalId: null, normalizedEmail: "jane@example.com" },
        ],
      },
    });
    expect(plan.blocks).toEqual([{ memberid: "M1", reason: "resolver-split" }]);
    expect(plan.backfills).toHaveLength(0);
  });
});

describe("buildRosterImportPlan — in-file ambiguity blocks (edge 14)", () => {
  it("blocks on a duplicate memberid within the file", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [
        member({ memberid: "DUP", email: "a@example.com" }),
        member({ memberid: "DUP", email: "b@example.com" }),
      ],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: { orgId: null, respondents: [] },
    });
    expect(plan.blocks.some((b) => b.reason === "duplicate-memberid")).toBe(true);
    // Plan must be invalid → no creates produced.
    expect(plan.creates).toHaveLength(0);
  });

  it("blocks on a duplicate normalizedEmail within the file", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: [
        member({ memberid: "A1", email: "dup@example.com" }),
        member({ memberid: "A2", email: "DUP@example.com" }),
      ],
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: { orgId: null, respondents: [] },
    });
    expect(plan.blocks.some((b) => b.reason === "duplicate-email")).toBe(true);
    expect(plan.creates).toHaveLength(0);
  });
});

describe("buildRosterImportPlan — fixture smoke", () => {
  it("plans all three sanitized fixture members as creates against an empty org", () => {
    const plan = buildRosterImportPlan({
      parsedMembers: loadMembers(),
      ownerCoachId: OWNER,
      companyName: COMPANY,
      existing: { orgId: null, respondents: [] },
    });
    expect(plan.creates).toHaveLength(3);
    expect(plan.skips).toHaveLength(0);
    expect(plan.blocks).toHaveLength(0);
    expect(plan.creates.map((c) => c.externalId).sort()).toEqual(
      ["CVMmsiWPTP", "MxRWB1GIwu", "mWSw2H9f6E"].sort(),
    );
  });
});
