/**
 * Wave T (spec 19t §T-5) — PATCH /api/admin/assessment-templates/[id]/versions/[versionId]
 * unconditional question-payload validation.
 *
 * Covers:
 *   - happy path: valid mixed-type payload persists the ORIGINAL payload
 *     byte-identically (validate-don't-strip: recommendations[] + unknown
 *     future fields survive)
 *   - 400s: INVALID_QUESTION, INVALID_STABLE_KEY, DUPLICATE_STABLE_KEY,
 *     MULTI_CHOICE_NO_OPTIONS, DUPLICATE_OPTION_KEY, MAX_CHOICES_INVALID,
 *     KEY_COLLIDES_WITH_PUBLISHED, TYPE_LOCKED
 *   - legal retype of a draft-only key (not published) → 200
 *   - legacy-shape acceptance: TEXT row carrying a stale `scale` object → 200
 *   - regressions: 409 ALREADY_PUBLISHED, 401 unauthenticated, 403 non-privileged
 *
 * Harness mirrors versions-edit-duplicate.test.ts (mocked next/server, db,
 * authorization, rate-limit). QuestionSchema + contentHash are the REAL
 * implementations.
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

const coachActor = {
  userId: "u2",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
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

// ─── Fixture question rows (all pass the real QuestionSchema) ─────────────

const sliderQ = {
  stableKey: "S1_vision",
  sortOrder: 0,
  type: "SLIDER_LIKERT",
  label: "Vision alignment",
  isRequired: true,
  scale: { min: 0, max: 10, step: 1, anchorMin: "Low", anchorMax: "High" },
  recommendations: [{ minScore: 0, maxScore: 10, text: "Keep going" }],
  futureField: { keep: "me" },
};

const textQ = {
  stableKey: "S1_notes",
  sortOrder: 1,
  type: "TEXT",
  label: "Notes",
  isRequired: false,
};

const numberQ = {
  stableKey: "S1_revenue",
  sortOrder: 2,
  type: "NUMBER",
  label: "Revenue (in million)",
  isRequired: false,
};

const multiQ = {
  stableKey: "S1_obstacles",
  sortOrder: 3,
  type: "MULTI_CHOICE",
  label: "Biggest obstacles",
  isRequired: true,
  options: [
    { key: "market", label: "The market" },
    { key: "people", label: "People" },
  ],
  maxChoices: 2,
};

const mixedPayload = [sliderQ, textQ, numberQ, multiQ];

/** Copy a fixture row without the named fields (lint-clean omission). */
function omit(
  row: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}

/** Draft version row as stored (questions = current stored draft content). */
function mockDraftVersion(questions: unknown[] = mixedPayload): void {
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
  // No published versions unless a test says otherwise.
  (db.assessmentTemplateVersion.findMany as jest.Mock).mockResolvedValue([]);
  (db.assessmentTemplateVersion.update as jest.Mock).mockResolvedValue({});
});

async function expect400(
  questions: unknown[],
  code: string,
): Promise<{ error: string; code: string }> {
  const res = await PATCH(patchReq(questions) as never, versionParams);
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.code).toBe(code);
  expect(db.assessmentTemplateVersion.update).not.toHaveBeenCalled();
  return body;
}

describe("PATCH version — Wave T question validation", () => {
  it("200 happy path: valid mixed-type payload persists the ORIGINAL payload (validate-don't-strip)", async () => {
    const res = await PATCH(patchReq(mixedPayload) as never, versionParams);
    expect(res.status).toBe(200);
    const upd = (db.assessmentTemplateVersion.update as jest.Mock).mock
      .calls[0][0];
    // Deep-equal including recommendations[] AND the unknown futureField —
    // Zod parse output (which strips unknowns) must NOT be what is stored.
    expect(upd.data.questions).toEqual(mixedPayload);
    expect(upd.data.questions[0].futureField).toEqual({ keep: "me" });
    expect(upd.data.questions[0].recommendations).toEqual(
      sliderQ.recommendations,
    );
    expect(upd.data.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(db.auditLog.create).toHaveBeenCalled();
  });

  it("queries published versions of THIS template for identity enforcement", async () => {
    await PATCH(patchReq(mixedPayload) as never, versionParams);
    expect(db.assessmentTemplateVersion.findMany).toHaveBeenCalledWith({
      where: { templateId: "tpl-1", publishedAt: { not: null } },
      select: { questions: true },
    });
  });

  it("400 INVALID_QUESTION — slider missing scale, names the stableKey + Zod issue", async () => {
    const badSlider = omit(sliderQ, "scale");
    const body = await expect400([badSlider, textQ], "INVALID_QUESTION");
    expect(body.error).toContain("S1_vision");
    expect(body.error).toContain("scale");
  });

  it("400 INVALID_STABLE_KEY — bad charset (leading digit)", async () => {
    const body = await expect400(
      [{ ...textQ, stableKey: "1bad_key" }],
      "INVALID_STABLE_KEY",
    );
    expect(body.error).toContain("1bad_key");
  });

  it("400 INVALID_STABLE_KEY — bad charset (space)", async () => {
    await expect400(
      [{ ...textQ, stableKey: "S1 notes" }],
      "INVALID_STABLE_KEY",
    );
  });

  it("400 INVALID_STABLE_KEY — over 40 chars", async () => {
    const longKey = `Q_${"a".repeat(39)}`; // 41 chars
    expect(longKey.length).toBe(41);
    await expect400([{ ...textQ, stableKey: longKey }], "INVALID_STABLE_KEY");
  });

  it("200 — a 40-char stableKey is legal (boundary)", async () => {
    const key40 = `Q_${"a".repeat(38)}`;
    expect(key40.length).toBe(40);
    const res = await PATCH(
      patchReq([{ ...textQ, stableKey: key40 }]) as never,
      versionParams,
    );
    expect(res.status).toBe(200);
  });

  it("400 DUPLICATE_STABLE_KEY — same key twice in the payload", async () => {
    const body = await expect400(
      [textQ, { ...numberQ, stableKey: "S1_notes" }],
      "DUPLICATE_STABLE_KEY",
    );
    expect(body.error).toContain("S1_notes");
  });

  it("400 MULTI_CHOICE_NO_OPTIONS — missing options", async () => {
    const noOptions = omit(multiQ, "options", "maxChoices");
    const body = await expect400([noOptions], "MULTI_CHOICE_NO_OPTIONS");
    expect(body.error).toContain("S1_obstacles");
  });

  it("400 MULTI_CHOICE_NO_OPTIONS — empty options array", async () => {
    await expect400(
      [{ ...omit(multiQ, "maxChoices"), options: [] }],
      "MULTI_CHOICE_NO_OPTIONS",
    );
  });

  it("400 DUPLICATE_OPTION_KEY — duplicate option keys within a question", async () => {
    const body = await expect400(
      [
        {
          ...multiQ,
          options: [
            { key: "market", label: "The market" },
            { key: "market", label: "The market again" },
          ],
        },
      ],
      "DUPLICATE_OPTION_KEY",
    );
    expect(body.error).toContain("market");
  });

  it("400 MAX_CHOICES_INVALID — maxChoices < 1", async () => {
    await expect400([{ ...multiQ, maxChoices: 0 }], "MAX_CHOICES_INVALID");
  });

  it("400 MAX_CHOICES_INVALID — maxChoices > option count", async () => {
    await expect400([{ ...multiQ, maxChoices: 3 }], "MAX_CHOICES_INVALID");
  });

  it("200 — maxChoices omitted (unlimited) is legal", async () => {
    const noMax = omit(multiQ, "maxChoices");
    const res = await PATCH(patchReq([noMax]) as never, versionParams);
    expect(res.status).toBe(200);
  });

  it("400 KEY_COLLIDES_WITH_PUBLISHED — new payload key exists in a published version but not the stored draft", async () => {
    mockDraftVersion([textQ]); // stored draft has only S1_notes
    (db.assessmentTemplateVersion.findMany as jest.Mock).mockResolvedValue([
      {
        questions: [
          { stableKey: "S2_published", type: "TEXT", label: "Old" },
        ],
      },
    ]);
    const body = await expect400(
      [textQ, { ...numberQ, stableKey: "S2_published" }],
      "KEY_COLLIDES_WITH_PUBLISHED",
    );
    expect(body.error).toContain("S2_published");
    expect(body.error.toLowerCase()).toContain("published");
  });

  it("400 TYPE_LOCKED — retyping a stored-draft key that also exists published", async () => {
    mockDraftVersion([textQ]); // stored draft: S1_notes is TEXT
    (db.assessmentTemplateVersion.findMany as jest.Mock).mockResolvedValue([
      { questions: [{ stableKey: "S1_notes", type: "TEXT", label: "Notes" }] },
    ]);
    const body = await expect400(
      [{ ...textQ, type: "NUMBER" }], // retype TEXT → NUMBER
      "TYPE_LOCKED",
    );
    expect(body.error).toContain("S1_notes");
  });

  it("200 legal retype — key exists ONLY in the stored draft (not published)", async () => {
    mockDraftVersion([textQ]); // stored draft: S1_notes TEXT, nothing published
    const res = await PATCH(
      patchReq([{ ...textQ, type: "NUMBER" }]) as never,
      versionParams,
    );
    expect(res.status).toBe(200);
    const upd = (db.assessmentTemplateVersion.update as jest.Mock).mock
      .calls[0][0];
    expect(upd.data.questions[0].type).toBe("NUMBER");
  });

  it("200 — union across MULTIPLE published versions is enforced", async () => {
    mockDraftVersion([textQ]);
    (db.assessmentTemplateVersion.findMany as jest.Mock).mockResolvedValue([
      { questions: [{ stableKey: "V1_only", type: "TEXT" }] },
      { questions: [{ stableKey: "V2_only", type: "NUMBER" }] },
      // Defensive-skip rows: non-object + missing stableKey must not throw.
      { questions: ["garbage", null, { label: "no key" }] },
      { questions: "not-an-array" },
    ]);
    await expect400(
      [{ ...numberQ, stableKey: "V2_only" }],
      "KEY_COLLIDES_WITH_PUBLISHED",
    );
  });

  it("200 legacy-shape acceptance — TEXT row carrying a stale scale object still passes", async () => {
    const staleScaleText = {
      ...textQ,
      // Old serializer injected scale into EVERY row; QuestionSchema is
      // non-strict so this must keep passing (old-client protection).
      scale: { min: 0, max: 10, step: 1, anchorMin: "a", anchorMax: "b" },
    };
    const res = await PATCH(patchReq([staleScaleText]) as never, versionParams);
    expect(res.status).toBe(200);
    const upd = (db.assessmentTemplateVersion.update as jest.Mock).mock
      .calls[0][0];
    // Validate-don't-strip: the stale scale is persisted as sent.
    expect(upd.data.questions[0].scale).toEqual(staleScaleText.scale);
  });

  it("409 ALREADY_PUBLISHED regression — validation never runs on a published version", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      templateId: "tpl-1",
      publishedAt: new Date(),
      questions: [],
    });
    // Payload is INVALID on purpose — 409 must win (validation runs after
    // the DRAFT confirmation).
    const res = await PATCH(
      patchReq([{ bogus: true }]) as never,
      versionParams,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("ALREADY_PUBLISHED");
    expect(db.assessmentTemplateVersion.findMany).not.toHaveBeenCalled();
  });

  it("401 unauthenticated regression", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await PATCH(patchReq(mixedPayload) as never, versionParams);
    expect(res.status).toBe(401);
  });

  it("403 non-privileged regression", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await PATCH(patchReq(mixedPayload) as never, versionParams);
    expect(res.status).toBe(403);
  });
});
