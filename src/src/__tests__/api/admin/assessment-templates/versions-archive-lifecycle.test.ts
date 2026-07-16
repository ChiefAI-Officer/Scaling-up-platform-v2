/**
 * Wave ED8 (spec 19ak §5) — version lifecycle WRITE endpoint tests.
 *
 * Covers:
 *   - POST   .../versions/[versionId]/archive  (archive — serves BOTH the UI's
 *     "Roll back…" on the Active row and "Archive" on Superseded rows)
 *   - DELETE .../versions/[versionId]/archive  (unarchive)
 *   - DELETE .../versions/[versionId]          (draft-only delete)
 *
 * Flag: WAVE_ED8_VERSION_LIFECYCLE_ENABLED is read at call time — set
 * per-test, restored after. Flag OFF ⇒ opaque 404 for all three WRITE
 * operations (Wave S benchmarks pattern); GET/PATCH on the versions route are
 * NOT flag-gated.
 *
 * Race hardening (co-validate C2): the archive state guards + update run in
 * ONE Serializable transaction; P2034 retried exactly once with the WHOLE
 * callback (guards included) re-evaluated.
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
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    assessmentCampaign: { count: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    $transaction: jest.fn(),
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

import {
  POST as archivePOST,
  DELETE as unarchiveDELETE,
} from "@/app/api/admin/assessment-templates/[id]/versions/[versionId]/archive/route";
import {
  GET as versionGET,
  PATCH as versionPATCH,
  DELETE as draftDELETE,
} from "@/app/api/admin/assessment-templates/[id]/versions/[versionId]/route";
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
  coachId: "c1",
};

const versionParams = {
  params: Promise.resolve({ id: "tpl-1", versionId: "ver-1" }),
};

function req(method: string): Request {
  return new Request("http://l", { method });
}

function jsonReq(body: unknown, method = "PATCH"): Request {
  return new Request("http://l", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const publishedRow = {
  id: "ver-1",
  templateId: "tpl-1",
  language: "enUS",
  versionNumber: 2,
  publishedAt: new Date("2026-06-01T00:00:00Z"),
  archivedAt: null,
};
const draftRow = { ...publishedRow, publishedAt: null };
const archivedRow = {
  ...publishedRow,
  archivedAt: new Date("2026-07-01T00:00:00Z"),
};

function p2034(): Error {
  return Object.assign(new Error("Transaction write conflict"), {
    code: "P2034",
  });
}

function lastAuditRow(): {
  entityType: string;
  entityId: string;
  action: string;
  performedBy: string;
  changes: Record<string, unknown>;
} {
  const calls = (db.auditLog.create as jest.Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const { data } = calls[calls.length - 1][0];
  return { ...data, changes: JSON.parse(data.changes) };
}

const FLAG_KEYS = [
  "WAVE_ED8_VERSION_LIFECYCLE_ENABLED",
  "WAVE_ED8_VERSION_LIFECYCLE_KILL",
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of FLAG_KEYS) savedEnv[key] = process.env[key];
  process.env.WAVE_ED8_VERSION_LIFECYCLE_ENABLED = "1";
  delete process.env.WAVE_ED8_VERSION_LIFECYCLE_KILL;
  // Default: the interactive-txn callback runs against the same mock client,
  // so in-txn calls land on the same jest.fn()s (invocationCallOrder works).
  (db.$transaction as jest.Mock)
    .mockReset()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(db),
    );
});

afterEach(() => {
  for (const key of FLAG_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

// Each entry builds a FRESH request per invocation.
const operations: Array<[string, () => Promise<Response>]> = [
  ["POST archive", () => archivePOST(req("POST") as never, versionParams)],
  [
    "DELETE unarchive",
    () => unarchiveDELETE(req("DELETE") as never, versionParams),
  ],
  ["DELETE draft", () => draftDELETE(req("DELETE") as never, versionParams)],
];

describe("lifecycle auth guards (all 3 operations)", () => {
  it.each(operations)("401 unauthenticated — %s", async (_name, run) => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await run();
    expect(res.status).toBe(401);
  });

  it.each(operations)("403 non-privileged — %s", async (_name, run) => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await run();
    expect(res.status).toBe(403);
  });
});

describe("lifecycle flag gating", () => {
  it.each(operations)(
    "404 when flag unset, zero DB reads — %s",
    async (_name, run) => {
      delete process.env.WAVE_ED8_VERSION_LIFECYCLE_ENABLED;
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      const res = await run();
      expect(res.status).toBe(404);
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(db.assessmentTemplateVersion.findUnique).not.toHaveBeenCalled();
      expect(db.assessmentTemplateVersion.delete).not.toHaveBeenCalled();
    },
  );

  it.each(operations)(
    "404 when KILL=1 hard-overrides ENABLED=1 — %s",
    async (_name, run) => {
      process.env.WAVE_ED8_VERSION_LIFECYCLE_KILL = "1";
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      const res = await run();
      expect(res.status).toBe(404);
    },
  );

  it("GET on the versions route is NOT flag-gated (200 with flag unset)", async () => {
    delete process.env.WAVE_ED8_VERSION_LIFECYCLE_ENABLED;
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      id: "ver-1",
      templateId: "tpl-1",
      versionNumber: 1,
      language: "enUS",
      questions: [],
      sections: [],
      scoringConfig: {},
      reportConfig: null,
      publishedAt: null,
      contentHash: "h",
    });
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      name: "Demo",
      alias: "demo",
      invitationSubject: "s",
      invitationBodyMarkdown: "b",
    });
    const res = await versionGET(req("GET") as never, versionParams);
    expect(res.status).toBe(200);
  });

  it("PATCH on the versions route is NOT flag-gated (409 ALREADY_PUBLISHED with flag unset, not 404)", async () => {
    delete process.env.WAVE_ED8_VERSION_LIFECYCLE_ENABLED;
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      templateId: "tpl-1",
      publishedAt: new Date(),
    });
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
      invitationSubject: "s",
      invitationBodyMarkdown: "b",
    });
    const res = await versionPATCH(
      jsonReq({
        questions: [
          {
            stableKey: "S1_demo",
            sortOrder: 0,
            type: "TEXT",
            label: "Demo question",
            isRequired: false,
          },
        ],
        sections: [{ id: "s" }],
        scoringConfig: { tiers: [] },
      }) as never,
      versionParams,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("ALREADY_PUBLISHED");
  });
});

describe("POST /archive (archive)", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
  });

  it("404 when version is missing", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      null,
    );
    const res = await archivePOST(req("POST") as never, versionParams);
    expect(res.status).toBe(404);
    expect(db.assessmentTemplateVersion.update).not.toHaveBeenCalled();
  });

  it("404 when version is on a different template", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      ...publishedRow,
      templateId: "tpl-other",
    });
    const res = await archivePOST(req("POST") as never, versionParams);
    expect(res.status).toBe(404);
    expect(db.assessmentTemplateVersion.update).not.toHaveBeenCalled();
  });

  it("409 NOT_PUBLISHED on a draft version", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      draftRow,
    );
    const res = await archivePOST(req("POST") as never, versionParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("NOT_PUBLISHED");
    expect(db.assessmentTemplateVersion.update).not.toHaveBeenCalled();
  });

  it("409 ALREADY_ARCHIVED on an archived version", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      archivedRow,
    );
    const res = await archivePOST(req("POST") as never, versionParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("ALREADY_ARCHIVED");
    expect(db.assessmentTemplateVersion.update).not.toHaveBeenCalled();
  });

  it("409 LAST_PUBLISHED_VERSION when sole active version (no update, no audit)", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      publishedRow,
    );
    (db.assessmentTemplateVersion.count as jest.Mock).mockResolvedValue(0);
    const res = await archivePOST(req("POST") as never, versionParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("LAST_PUBLISHED_VERSION");
    expect(db.assessmentTemplateVersion.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("per-language guard: archiving the last enUS version is blocked even with a published esES sibling", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      publishedRow,
    );
    // Fake table: the enUS target + a published esES sibling. The count mock
    // honors the language filter — proving the guard is per-(template,language).
    const rows = [
      { id: "ver-1", language: "enUS", published: true, archived: false },
      { id: "ver-es", language: "esES", published: true, archived: false },
    ];
    (db.assessmentTemplateVersion.count as jest.Mock).mockImplementation(
      async ({
        where,
      }: {
        where: { language: string; id: { not: string } };
      }) =>
        rows.filter(
          (r) =>
            r.language === where.language &&
            r.id !== where.id.not &&
            r.published &&
            !r.archived,
        ).length,
    );
    const res = await archivePOST(req("POST") as never, versionParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("LAST_PUBLISHED_VERSION");
    // The sibling count is scoped to the version's own language + excludes
    // itself + only counts active (published, non-archived) rows.
    const countArgs = (db.assessmentTemplateVersion.count as jest.Mock).mock
      .calls[0][0];
    expect(countArgs.where).toEqual({
      templateId: "tpl-1",
      language: "enUS",
      publishedAt: { not: null },
      archivedAt: null,
      id: { not: "ver-1" },
    });
  });

  it("200 archives: Serializable txn, update sets ONLY archivedAt, audit logged", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      publishedRow,
    );
    (db.assessmentTemplateVersion.count as jest.Mock).mockResolvedValue(1);
    const res = await archivePOST(req("POST") as never, versionParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.versionId).toBe("ver-1");
    expect(typeof body.data.archivedAt).toBe("string");

    // Serializable isolation (co-validate C2 — BLOCKER).
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });

    // The DB trigger rejects anything beyond archivedAt on a published row —
    // the update payload must be EXACTLY { archivedAt }.
    const updateArgs = (db.assessmentTemplateVersion.update as jest.Mock).mock
      .calls[0][0];
    expect(updateArgs.where).toEqual({ id: "ver-1" });
    expect(updateArgs.data).toEqual({ archivedAt: expect.any(Date) });
    expect(Object.keys(updateArgs.data)).toEqual(["archivedAt"]);

    const audit = lastAuditRow();
    expect(audit.entityType).toBe("AssessmentTemplateVersion");
    expect(audit.entityId).toBe("ver-1");
    expect(audit.action).toBe("TEMPLATE_VERSION_ARCHIVED");
    expect(audit.performedBy).toBe("admin@example.com");
    expect(audit.changes).toEqual({
      templateId: "tpl-1",
      versionNumber: 2,
      language: "enUS",
    });
  });

  it("evaluates the version re-read AND the sibling count INSIDE the transaction callback", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      publishedRow,
    );
    (db.assessmentTemplateVersion.count as jest.Mock).mockResolvedValue(1);
    await archivePOST(req("POST") as never, versionParams);
    const txnStart = (db.$transaction as jest.Mock).mock
      .invocationCallOrder[0];
    const findOrder = (db.assessmentTemplateVersion.findUnique as jest.Mock)
      .mock.invocationCallOrder[0];
    const countOrder = (db.assessmentTemplateVersion.count as jest.Mock).mock
      .invocationCallOrder[0];
    // Both guards ran AFTER the transaction was opened — never before it.
    expect(findOrder).toBeGreaterThan(txnStart);
    expect(countOrder).toBeGreaterThan(txnStart);
  });

  it("race: P2034 on the first attempt is retried ONCE — guards re-run, then 200", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      publishedRow,
    );
    (db.assessmentTemplateVersion.count as jest.Mock).mockResolvedValue(1);
    (db.$transaction as jest.Mock)
      // First attempt: the callback RUNS (guards evaluated) then the commit
      // fails with a serialization conflict.
      .mockImplementationOnce(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          await fn(db);
          throw p2034();
        },
      )
      .mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(db),
      );
    const res = await archivePOST(req("POST") as never, versionParams);
    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    // The WHOLE callback re-ran: version re-read + sibling count both twice.
    expect(db.assessmentTemplateVersion.findUnique).toHaveBeenCalledTimes(2);
    expect(db.assessmentTemplateVersion.count).toHaveBeenCalledTimes(2);
    // Audit fires once, after the committed attempt.
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("race: the retry re-evaluates the guards — concurrent archive wins, retry returns 409 LAST_PUBLISHED_VERSION", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      publishedRow,
    );
    // By the retry, the concurrent archive committed: no active sibling left.
    (db.assessmentTemplateVersion.count as jest.Mock).mockResolvedValue(0);
    (db.$transaction as jest.Mock)
      .mockImplementationOnce(async () => {
        throw p2034();
      })
      .mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(db),
      );
    const res = await archivePOST(req("POST") as never, versionParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("LAST_PUBLISHED_VERSION");
    expect(db.assessmentTemplateVersion.update).not.toHaveBeenCalled();
  });

  it("race: P2034 twice → 500 (retried exactly once)", async () => {
    (db.$transaction as jest.Mock).mockRejectedValue(p2034());
    const res = await archivePOST(req("POST") as never, versionParams);
    expect(res.status).toBe(500);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });

  it("non-P2034 transaction error → 500 without retry", async () => {
    (db.$transaction as jest.Mock).mockRejectedValue(new Error("boom"));
    const res = await archivePOST(req("POST") as never, versionParams);
    expect(res.status).toBe(500);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /archive (unarchive)", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
  });

  it("404 when version is missing", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      null,
    );
    const res = await unarchiveDELETE(req("DELETE") as never, versionParams);
    expect(res.status).toBe(404);
  });

  it("404 when version is on a different template", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      ...archivedRow,
      templateId: "tpl-other",
    });
    const res = await unarchiveDELETE(req("DELETE") as never, versionParams);
    expect(res.status).toBe(404);
    expect(db.assessmentTemplateVersion.update).not.toHaveBeenCalled();
  });

  it("409 NOT_ARCHIVED when archivedAt is null", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      publishedRow,
    );
    const res = await unarchiveDELETE(req("DELETE") as never, versionParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("NOT_ARCHIVED");
    expect(db.assessmentTemplateVersion.update).not.toHaveBeenCalled();
  });

  it("200 unarchives: update sets EXACTLY { archivedAt: null }, audit logged", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      archivedRow,
    );
    const res = await unarchiveDELETE(req("DELETE") as never, versionParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.versionId).toBe("ver-1");

    const updateArgs = (db.assessmentTemplateVersion.update as jest.Mock).mock
      .calls[0][0];
    expect(updateArgs.where).toEqual({ id: "ver-1" });
    expect(updateArgs.data).toEqual({ archivedAt: null });
    expect(Object.keys(updateArgs.data)).toEqual(["archivedAt"]);

    const audit = lastAuditRow();
    expect(audit.entityType).toBe("AssessmentTemplateVersion");
    expect(audit.entityId).toBe("ver-1");
    expect(audit.action).toBe("TEMPLATE_VERSION_UNARCHIVED");
    expect(audit.changes).toEqual({
      templateId: "tpl-1",
      versionNumber: 2,
      language: "enUS",
    });
  });
});

describe("DELETE /versions/[versionId] (draft-only delete)", () => {
  beforeEach(() => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
  });

  it("404 when version is missing", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      null,
    );
    const res = await draftDELETE(req("DELETE") as never, versionParams);
    expect(res.status).toBe(404);
    expect(db.assessmentTemplateVersion.delete).not.toHaveBeenCalled();
  });

  it("404 when version is on a different template", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      ...draftRow,
      templateId: "tpl-other",
    });
    const res = await draftDELETE(req("DELETE") as never, versionParams);
    expect(res.status).toBe(404);
    expect(db.assessmentTemplateVersion.delete).not.toHaveBeenCalled();
  });

  it("409 ALREADY_PUBLISHED on a published version", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      publishedRow,
    );
    const res = await draftDELETE(req("DELETE") as never, versionParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("ALREADY_PUBLISHED");
    expect(db.assessmentTemplateVersion.delete).not.toHaveBeenCalled();
  });

  it("409 VERSION_IN_USE via campaign preflight count", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      draftRow,
    );
    (db.assessmentCampaign.count as jest.Mock).mockResolvedValue(2);
    const res = await draftDELETE(req("DELETE") as never, versionParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("VERSION_IN_USE");
    expect(db.assessmentCampaign.count).toHaveBeenCalledWith({
      where: { versionId: "ver-1" },
    });
    expect(db.assessmentTemplateVersion.delete).not.toHaveBeenCalled();
  });

  it("409 VERSION_IN_USE when the delete hits a P2003 FK race", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      draftRow,
    );
    (db.assessmentCampaign.count as jest.Mock).mockResolvedValue(0);
    (db.assessmentTemplateVersion.delete as jest.Mock).mockRejectedValue(
      Object.assign(new Error("Foreign key constraint failed"), {
        code: "P2003",
      }),
    );
    const res = await draftDELETE(req("DELETE") as never, versionParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("VERSION_IN_USE");
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("non-P2003 delete error → 500", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      draftRow,
    );
    (db.assessmentCampaign.count as jest.Mock).mockResolvedValue(0);
    (db.assessmentTemplateVersion.delete as jest.Mock).mockRejectedValue(
      new Error("boom"),
    );
    const res = await draftDELETE(req("DELETE") as never, versionParams);
    expect(res.status).toBe(500);
  });

  it("200 deletes the draft + audits TEMPLATE_VERSION_DELETED", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(
      draftRow,
    );
    (db.assessmentCampaign.count as jest.Mock).mockResolvedValue(0);
    (db.assessmentTemplateVersion.delete as jest.Mock).mockResolvedValue(
      draftRow,
    );
    const res = await draftDELETE(req("DELETE") as never, versionParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.deletedVersionId).toBe("ver-1");
    expect(db.assessmentTemplateVersion.delete).toHaveBeenCalledWith({
      where: { id: "ver-1" },
    });

    const audit = lastAuditRow();
    expect(audit.entityType).toBe("AssessmentTemplateVersion");
    expect(audit.entityId).toBe("ver-1");
    expect(audit.action).toBe("TEMPLATE_VERSION_DELETED");
    expect(audit.performedBy).toBe("admin@example.com");
    expect(audit.changes).toEqual({
      templateId: "tpl-1",
      versionNumber: 2,
      language: "enUS",
      wasDraft: true,
    });
  });
});
