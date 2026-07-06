/**
 * Wave U (spec 19u §U-2) — PATCH /api/admin/assessment-templates/[id]/versions/[versionId]
 * findings-rule shapes at the draft-save boundary.
 *
 * Pins the LAYERING deliberately (spec D10 validation ladder):
 *   - draft save accepts well-shaped per-type rules and persists the ORIGINAL
 *     payload (validate-don't-strip — unknown sibling fields survive)
 *   - cross-shape rules (bands on MULTI_CHOICE, option-rules on NUMBER) are
 *     shape errors → 400 at save
 *   - rules on TEXT pass the (non-strict) shape schema at SAVE — rejection is
 *     the PUBLISH tier's job, not the PATCH's
 *   - tiling/coverage/optionKey-exists are NOT save-tier concerns (publish)
 *
 * Harness mirrors template-version-patch.wave-t.test.ts (mocked next/server,
 * db, authorization, rate-limit; REAL question schemas).
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    assessmentTemplate: { findUnique: jest.fn() },
    assessmentTemplateVersion: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

import { PATCH } from "@/app/api/admin/assessment-templates/[id]/versions/[versionId]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const adminActor = {
  userId: "u1",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

const versionParams = {
  params: Promise.resolve({ id: "tpl-1", versionId: "ver-1" }),
};

function patchReq(questions: unknown[]): Request {
  return new Request("http://l", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      questions,
      sections: [],
      scoringConfig: { tiers: [] },
    }),
  });
}

// ─── Fixture rows carrying Wave U findings rules ───────────────────────────

const numberWithBands = {
  stableKey: "S1_headcount",
  sortOrder: 0,
  type: "NUMBER",
  label: "Headcount",
  isRequired: false,
  recommendations: [
    { minScore: 0, maxScore: 9, text: "Focus on hiring fundamentals." },
    { minScore: 50, maxScore: 249, text: "Introduce middle management." },
  ],
  futureField: { keep: "me" },
};

const multiWithOptionRules = {
  stableKey: "S1_obstacles",
  sortOrder: 1,
  type: "MULTI_CHOICE",
  label: "Biggest obstacles",
  isRequired: true,
  options: [
    { key: "cash", label: "Cash" },
    { key: "people", label: "People" },
  ],
  maxChoices: 2,
  recommendations: [
    { optionKey: "cash", text: "Review your cash conversion cycle." },
  ],
};

const textQ = {
  stableKey: "S1_notes",
  sortOrder: 2,
  type: "TEXT",
  label: "Notes",
  isRequired: false,
};

const wavePayload = [numberWithBands, multiWithOptionRules, textQ];

function mockDraftVersion(questions: unknown[] = wavePayload): void {
  (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
    templateId: "tpl-1",
    publishedAt: null,
    questions,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (getApiActor as jest.Mock).mockResolvedValue(adminActor);
  mockDraftVersion();
  (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
    invitationSubject: "s",
    invitationBodyMarkdown: "b",
  });
  (db.assessmentTemplateVersion.findMany as jest.Mock).mockResolvedValue([]);
  (db.assessmentTemplateVersion.update as jest.Mock).mockResolvedValue({});
});

async function expect400(questions: unknown[]): Promise<{ code: string }> {
  const res = await PATCH(patchReq(questions) as never, versionParams);
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(db.assessmentTemplateVersion.update).not.toHaveBeenCalled();
  return body;
}

describe("PATCH version — Wave U findings-rule shapes", () => {
  it("200: NUMBER bands + MULTI_CHOICE option rules persist byte-identically (validate-don't-strip)", async () => {
    const res = await PATCH(patchReq(wavePayload) as never, versionParams);
    expect(res.status).toBe(200);
    const upd = (db.assessmentTemplateVersion.update as jest.Mock).mock
      .calls[0][0];
    expect(upd.data.questions).toEqual(wavePayload);
    expect(upd.data.questions[0].recommendations).toEqual(
      numberWithBands.recommendations,
    );
    expect(upd.data.questions[0].futureField).toEqual({ keep: "me" });
    expect(upd.data.questions[1].recommendations).toEqual(
      multiWithOptionRules.recommendations,
    );
  });

  it("200: NUMBER bands may leave gaps at SAVE (coverage is never a save-tier concern)", async () => {
    // The fixture's bands already gap (10-49 uncovered) — explicit re-assert.
    const res = await PATCH(
      patchReq([numberWithBands]) as never,
      versionParams,
    );
    expect(res.status).toBe(200);
  });

  it("400: band-shaped rules on MULTI_CHOICE are a shape error", async () => {
    await expect400([
      {
        ...multiWithOptionRules,
        recommendations: [{ minScore: 0, maxScore: 1, text: "wrong shape" }],
      },
    ]);
  });

  it("400: option-rule-shaped rules on NUMBER are a shape error", async () => {
    await expect400([
      {
        ...numberWithBands,
        recommendations: [{ optionKey: "cash", text: "wrong shape" }],
      },
    ]);
  });

  it("400: malformed band on NUMBER (missing text) rejected", async () => {
    await expect400([
      {
        ...numberWithBands,
        recommendations: [{ minScore: 0, maxScore: 9 }],
      },
    ]);
  });

  it("200: rules on TEXT pass the SAVE tier (publish is where TEXT rejection lives — spec D10 layering)", async () => {
    const res = await PATCH(
      patchReq([
        { ...textQ, recommendations: [{ minScore: 0, maxScore: 1, text: "x" }] },
      ]) as never,
      versionParams,
    );
    expect(res.status).toBe(200);
  });

  it("200: optionKey not among options passes SAVE (publish-tier check)", async () => {
    const res = await PATCH(
      patchReq([
        {
          ...multiWithOptionRules,
          recommendations: [{ optionKey: "ghost", text: "dangling ok at save" }],
        },
      ]) as never,
      versionParams,
    );
    expect(res.status).toBe(200);
  });
});
