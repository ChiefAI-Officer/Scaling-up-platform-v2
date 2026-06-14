/**
 * Wave B — Task 2: per-workshop customHtml write path.
 *
 * Re-opens a deliberately-blocked admin-only write path on
 * PUT /api/workshops/[id]/landing-pages/[template] with:
 *   - flag gate (WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED, default off → no-regression)
 *   - admin-only gate (coach customHtml → 403)
 *   - mode-exclusive (customHtml cannot coexist with content/status/customCode)
 *   - eligibility (SOLO_LANDING / DUO_LANDING only carry non-null customHtml)
 *   - sanitize-on-write + token interpolation (Task 1 builder)
 *   - value-compare CAS on updates (expectedCustomHtml) → 409 on mismatch
 *   - prior-body AuditLog row written in the SAME db.$transaction
 *   - no-row first save → create path synthesizes valid content; P2002 → 409
 *   - post-interpolation length cap → 400
 *
 * Behavior is asserted through the real PUT handler with mocked db / session.
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
    workshop: {
      findUnique: jest.fn(),
    },
    landingPage: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    pageTemplate: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    auditLog: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  canManageCoachData: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

// Task 1 builder — drives token interpolation of customHtml.
jest.mock("@/lib/templates/landing-page-variables", () => ({
  buildEnrichedLandingPageVariables: jest.fn().mockResolvedValue({
    workshop_title: "Test Workshop",
    registration_url: "https://app.example.com/workshop/reg-slug",
    registrationUrl: "https://app.example.com/workshop/reg-slug",
  }),
}));

jest.mock("@/lib/templates/template-interpolation", () => ({
  buildWorkshopVariables: jest.fn().mockResolvedValue({
    workshop_title: "Test Workshop",
  }),
}));

// Real escape-and-substitute so token resolution is observable in stored values.
jest.mock("@/lib/templates/interpolate-content-html", () => {
  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  return {
    interpolateContentForHtml: jest.fn(
      (template: string, variables: Record<string, string | null | undefined>) => {
        let out = template;
        for (const [key, raw] of Object.entries(variables)) {
          const value = raw == null ? "" : raw;
          const escaped = escapeHtml(value);
          out = out.split(`{{${key}}}`).join(escaped);
          out = out.split(`{{ ${key} }}`).join(escaped);
        }
        return out;
      }
    ),
  };
});

// Real-ish sanitizer: strips <script> tags + javascript: hrefs so the stored
// value can be asserted XSS-safe.
jest.mock("@/lib/templates/sanitize-custom-html", () => ({
  sanitizeCustomHtml: jest.fn((input: string) => {
    let didStripContent = false;
    let out = input;
    if (/<\s*script/i.test(out)) {
      didStripContent = true;
      out = out.replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "");
    }
    if (/javascript:/i.test(out)) {
      didStripContent = true;
      out = out.replace(/javascript:/gi, "");
    }
    return { sanitized: out, didStripContent, strippedTags: [], strippedAttrs: [] };
  }),
  FRAME_SRC_ALLOWLIST: [],
}));

jest.mock("@/lib/templates/interpolate-custom-code", () => ({
  validateCustomCode: jest.fn(() => ({ valid: true })),
}));

// Rate limit — always allow in tests.
jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: { interval: 60000, maxRequests: 100 } },
  checkRateLimitAsync: jest.fn().mockResolvedValue({
    success: true,
    remaining: 99,
    resetAt: Date.now() + 60000,
  }),
}));

import { PUT, GET } from "@/app/api/workshops/[id]/landing-pages/[template]/route";
import { db } from "@/lib/db";
import { getApiActor, canManageCoachData } from "@/lib/auth/authorization";

const adminActor = {
  userId: "admin-user",
  email: "admin@example.com",
  role: "ADMIN",
  coachId: null,
};

const coachActor = {
  userId: "coach-user",
  email: "coach@example.com",
  role: "COACH",
  coachId: "coach-1",
};

const fakeWorkshop = {
  id: "workshop-1",
  title: "Test Workshop",
  coachId: "coach-1",
  categoryId: null,
};

const FLAG = "WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED";

function buildPutRequest(
  workshopId: string,
  template: string,
  body: Record<string, unknown>
): Parameters<typeof PUT>[0] {
  return new Request(
    `http://localhost/api/workshops/${workshopId}/landing-pages/${template}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  ) as unknown as Parameters<typeof PUT>[0];
}

function routeParams(workshopId: string, template: string) {
  return { params: Promise.resolve({ id: workshopId, template }) };
}

function buildGetRequest(
  workshopId: string,
  template: string,
  queryParams?: Record<string, string>
): Parameters<typeof GET>[0] {
  const url = new URL(
    `http://localhost/api/workshops/${workshopId}/landing-pages/${template}`
  );
  if (queryParams) {
    for (const [k, v] of Object.entries(queryParams)) {
      url.searchParams.set(k, v);
    }
  }
  return new Request(url.toString(), { method: "GET" }) as unknown as Parameters<typeof GET>[0];
}

function buildRestorePutRequest(
  workshopId: string,
  template: string,
  body: Record<string, unknown>
): Parameters<typeof PUT>[0] {
  const url = `http://localhost/api/workshops/${workshopId}/landing-pages/${template}?action=restore-html`;
  return new Request(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof PUT>[0];
}

/**
 * A DISTINCT jest.fn for tx.auditLog.create — separate from the global
 * db.auditLog.create mock. This lets tests assert that the audit write
 * went through the transaction handle (tx), not the global db client.
 */
const txAuditLogCreate = jest.fn();

/**
 * A DISTINCT jest.fn for the restore-path tx.auditLog.create write, so
 * restore tests can isolate their audit write from save-path tests.
 */
const txRestoreAuditLogCreate = jest.fn();

/**
 * Wire db.$transaction to invoke its callback with a tx client that proxies
 * to the mocked db methods, so in-transaction calls are observable.
 * tx.auditLog.create is a DISTINCT fn from db.auditLog.create so tests
 * can prove the audit write is inside the transaction.
 */
function wireTransaction() {
  (db.$transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      landingPage: {
        updateMany: db.landingPage.updateMany,
        findUnique: db.landingPage.findUnique,
        create: db.landingPage.create,
      },
      auditLog: {
        create: txAuditLogCreate,
      },
    })
  );
}

describe("Wave B Task 2 — per-workshop customHtml PUT", () => {
  const originalFlag = process.env[FLAG];

  beforeEach(() => {
    jest.clearAllMocks();
    process.env[FLAG] = "1";
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (canManageCoachData as jest.Mock).mockReturnValue(true);
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(fakeWorkshop);
    wireTransaction();
  });

  afterAll(() => {
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  // -------------------------------------------------------------------------
  // Group A — coach gate + content no-regression
  // -------------------------------------------------------------------------
  describe("admin-only gate", () => {
    it("coach PUT carrying customHtml → 403", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>x</p>",
          expectedCustomHtml: null,
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(403);
    });

    it("coach PUT WITHOUT customHtml (content only) → still 200", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockImplementation((args: { data: unknown }) =>
        Promise.resolve({ id: "lp-1", ...(args.data as object) })
      );

      const response = await PUT(
        buildPutRequest("workshop-1", "REGISTRATION", {
          content: { heroHeadline: "Test" },
          status: "DRAFT",
        }),
        routeParams("workshop-1", "REGISTRATION")
      );

      expect(response.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Group B — flag gate (default OFF = no regression)
  // -------------------------------------------------------------------------
  describe("flag gate", () => {
    it("flag OFF + customHtml in body → 403/404 (blocked)", async () => {
      delete process.env[FLAG];
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>x</p>",
          expectedCustomHtml: null,
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect([403, 404]).toContain(response.status);
      process.env[FLAG] = "1";
    });

    it("flag OFF + content-only PUT → still 200 (no regression)", async () => {
      delete process.env[FLAG];
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
        id: "lp-1",
        workshopId: "workshop-1",
        template: "REGISTRATION",
        slug: "x",
        content: "{}",
        status: "DRAFT",
        publishedAt: null,
        customHtml: null,
      });
      (db.landingPage.update as jest.Mock).mockImplementation((args: { data: unknown }) =>
        Promise.resolve({ id: "lp-1", ...(args.data as object) })
      );

      const response = await PUT(
        buildPutRequest("workshop-1", "REGISTRATION", {
          content: { heroHeadline: "New" },
          status: "DRAFT",
        }),
        routeParams("workshop-1", "REGISTRATION")
      );

      expect(response.status).toBe(200);
      process.env[FLAG] = "1";
    });
  });

  // -------------------------------------------------------------------------
  // Group C — sanitize + interpolate on write
  // -------------------------------------------------------------------------
  describe("sanitize + interpolate", () => {
    function existingSolo(customHtml: string | null = "<p>old</p>") {
      return {
        id: "lp-1",
        workshopId: "workshop-1",
        template: "SOLO_LANDING",
        slug: "x",
        content: JSON.stringify({ hero: "keep" }),
        status: "DRAFT",
        publishedAt: null,
        customHtml,
      };
    }

    it("admin customHtml with <script>/javascript: → stored value sanitized", async () => {
      (db.landingPage.findUnique as jest.Mock)
        .mockResolvedValueOnce(existingSolo()) // pre-load existing
        .mockResolvedValueOnce({ ...existingSolo(), customHtml: "<p>clean</p>" }); // post-tx re-read
      (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: '<p>hi</p><script>alert(1)</script><a href="javascript:evil()">x</a>',
          expectedCustomHtml: "<p>old</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(200);
      const data = (db.landingPage.updateMany as jest.Mock).mock.calls[0][0].data;
      expect(data.customHtml).not.toMatch(/<script/i);
      expect(data.customHtml).not.toMatch(/javascript:/i);
    });

    it("admin customHtml with {{registration_url}} → stored value resolves the token", async () => {
      (db.landingPage.findUnique as jest.Mock)
        .mockResolvedValueOnce(existingSolo())
        .mockResolvedValueOnce({ ...existingSolo() });
      (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: '<a href="{{registration_url}}">Register</a>',
          expectedCustomHtml: "<p>old</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      const data = (db.landingPage.updateMany as jest.Mock).mock.calls[0][0].data;
      expect(data.customHtml).toContain("https://app.example.com/workshop/reg-slug");
      expect(data.customHtml).not.toContain("{{registration_url}}");
    });

    it("ineligible template (REGISTRATION) + non-null customHtml → 400", async () => {
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
        id: "lp-reg",
        workshopId: "workshop-1",
        template: "REGISTRATION",
        slug: "x",
        content: "{}",
        status: "DRAFT",
        publishedAt: null,
        customHtml: null,
      });

      const response = await PUT(
        buildPutRequest("workshop-1", "REGISTRATION", {
          customHtml: "<p>nope</p>",
          expectedCustomHtml: null,
        }),
        routeParams("workshop-1", "REGISTRATION")
      );

      expect(response.status).toBe(400);
    });

    it("inbound length cap (Zod) → 400", async () => {
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(existingSolo());
      const huge = "<p>" + "a".repeat(600_000) + "</p>";

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: huge,
          expectedCustomHtml: "<p>old</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(400);
    });

    it("post-interpolation length cap → 400 (token expansion pushes rendered HTML over the limit)", async () => {
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(existingSolo());
      // Inbound is small (under the Zod cap) but interpolation expands it past
      // CUSTOM_HTML_MAX_LENGTH. Stub the interpolator to simulate that expansion.
      const { interpolateContentForHtml } = jest.requireMock(
        "@/lib/templates/interpolate-content-html"
      );
      (interpolateContentForHtml as jest.Mock).mockReturnValueOnce(
        "<p>" + "a".repeat(600_000) + "</p>"
      );

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>{{registration_url}}</p>",
          expectedCustomHtml: "<p>old</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(400);
      // It must NOT have reached the write.
      expect((db.landingPage.updateMany as jest.Mock)).not.toHaveBeenCalled();
    });

    it("sanitizerStripped: true in response when sanitizer strips <script>", async () => {
      (db.landingPage.findUnique as jest.Mock)
        .mockResolvedValueOnce(existingSolo())
        .mockResolvedValueOnce({ ...existingSolo(), customHtml: "<p>hi</p>" });
      (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      txAuditLogCreate.mockResolvedValue({ id: "audit-1" });

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: '<p>hi</p><script>evil()</script>',
          expectedCustomHtml: "<p>old</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.sanitizerStripped).toBe(true);
    });

    it("sanitizerStripped: false in response when sanitizer strips nothing", async () => {
      (db.landingPage.findUnique as jest.Mock)
        .mockResolvedValueOnce(existingSolo())
        .mockResolvedValueOnce({ ...existingSolo(), customHtml: "<p>clean</p>" });
      (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      txAuditLogCreate.mockResolvedValue({ id: "audit-1" });

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>clean</p>",
          expectedCustomHtml: "<p>old</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.sanitizerStripped).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Group D — column-scoped write (Q6)
  // -------------------------------------------------------------------------
  describe("column-scoped write", () => {
    it("customHtml-only PUT leaves existing content untouched (no content in update data)", async () => {
      const existing = {
        id: "lp-1",
        workshopId: "workshop-1",
        template: "SOLO_LANDING",
        slug: "x",
        content: JSON.stringify({ hero: "keepme" }),
        status: "DRAFT",
        publishedAt: null,
        customHtml: "<p>old</p>",
      };
      (db.landingPage.findUnique as jest.Mock)
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ ...existing, customHtml: "<p>new</p>" });
      (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>new</p>",
          expectedCustomHtml: "<p>old</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      const data = (db.landingPage.updateMany as jest.Mock).mock.calls[0][0].data;
      expect(data).not.toHaveProperty("content");
      expect(data.customHtml).toBe("<p>new</p>");
    });
  });

  // -------------------------------------------------------------------------
  // Group E — value-compare CAS (R2-MED-2)
  // -------------------------------------------------------------------------
  describe("value-compare CAS", () => {
    function existing(customHtml: string | null = "<p>stored</p>") {
      return {
        id: "lp-1",
        workshopId: "workshop-1",
        template: "SOLO_LANDING",
        slug: "x",
        content: "{}",
        status: "DRAFT",
        publishedAt: null,
        customHtml,
      };
    }

    it("expectedCustomHtml mismatches stored value → 409 (updateMany count 0)", async () => {
      (db.landingPage.findUnique as jest.Mock).mockResolvedValueOnce(existing());
      (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>new</p>",
          expectedCustomHtml: "<p>WRONG</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(409);
      const where = (db.landingPage.updateMany as jest.Mock).mock.calls[0][0].where;
      expect(where.customHtml).toBe("<p>WRONG</p>");
    });

    it("expectedCustomHtml matches stored value → 200", async () => {
      (db.landingPage.findUnique as jest.Mock)
        .mockResolvedValueOnce(existing())
        .mockResolvedValueOnce({ ...existing(), customHtml: "<p>new</p>" });
      (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>new</p>",
          expectedCustomHtml: "<p>stored</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(200);
      const where = (db.landingPage.updateMany as jest.Mock).mock.calls[0][0].where;
      expect(where.customHtml).toBe("<p>stored</p>");
    });

    it("double-write same expectedCustomHtml: first wins (count 1), second 409s (count 0)", async () => {
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(existing());
      (db.landingPage.updateMany as jest.Mock)
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      // First write's post-tx re-read returns a row; not strictly needed for 2nd.
      (db.landingPage.findUnique as jest.Mock)
        .mockResolvedValueOnce(existing())
        .mockResolvedValueOnce({ ...existing(), customHtml: "<p>new</p>" })
        .mockResolvedValueOnce(existing());

      const first = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>new</p>",
          expectedCustomHtml: "<p>stored</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );
      const second = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>other</p>",
          expectedCustomHtml: "<p>stored</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(409);
    });

    it("customHtml PUT on existing row WITHOUT expectedCustomHtml field → 400", async () => {
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(existing());

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>new</p>",
          // expectedCustomHtml intentionally ABSENT
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Group F — mode-exclusive (R2-MED-1)
  // -------------------------------------------------------------------------
  describe("mode-exclusive", () => {
    it("customHtml + content together → 400", async () => {
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>x</p>",
          content: { hero: "x" },
          expectedCustomHtml: null,
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(400);
    });

    it("customHtml + status together → 400", async () => {
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>x</p>",
          status: "PUBLISHED",
          expectedCustomHtml: null,
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(400);
    });

    it("customHtml + customCode together → 400", async () => {
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>x</p>",
          customCode: "<script>track()</script>",
          expectedCustomHtml: null,
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(400);
    });

    it("content-only PUT (coach) → still 200", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.landingPage.create as jest.Mock).mockImplementation((args: { data: unknown }) =>
        Promise.resolve({ id: "lp-1", ...(args.data as object) })
      );

      const response = await PUT(
        buildPutRequest("workshop-1", "REGISTRATION", {
          content: { heroHeadline: "x" },
          status: "DRAFT",
        }),
        routeParams("workshop-1", "REGISTRATION")
      );

      expect(response.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Group G — prior-body audit row in same transaction (Q1)
  // -------------------------------------------------------------------------
  describe("prior-body AuditLog", () => {
    it("successful update writes UPDATE_CUSTOM_HTML audit row with previousCustomHtml via tx (not global db)", async () => {
      const existing = {
        id: "lp-1",
        workshopId: "workshop-1",
        template: "SOLO_LANDING",
        slug: "x",
        content: "{}",
        status: "DRAFT",
        publishedAt: null,
        customHtml: "<p>the-old-value</p>",
      };
      (db.landingPage.findUnique as jest.Mock)
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ ...existing, customHtml: "<p>new</p>" });
      (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      txAuditLogCreate.mockResolvedValue({ id: "audit-1" });

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>new</p>",
          expectedCustomHtml: "<p>the-old-value</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(200);

      // The audit write MUST go through the tx handle (inside the transaction).
      expect(txAuditLogCreate).toHaveBeenCalledTimes(1);
      const auditArg = txAuditLogCreate.mock.calls[0][0].data;
      expect(auditArg.entityType).toBe("LandingPage");
      expect(auditArg.entityId).toBe("lp-1");
      expect(auditArg.action).toBe("UPDATE_CUSTOM_HTML");
      const changes = JSON.parse(auditArg.changes);
      expect(changes.previousCustomHtml).toBe("<p>the-old-value</p>");

      // The GLOBAL db.auditLog.create must NOT have been called — that would mean
      // the audit bypassed the transaction and is not atomic with the row write.
      expect(db.auditLog.create as jest.Mock).not.toHaveBeenCalled();

      // The transaction itself must have been invoked.
      expect(db.$transaction as jest.Mock).toHaveBeenCalled();
    });

    it("audit failure inside tx → route returns 500 (no silent partial write)", async () => {
      // If tx.auditLog.create throws, the $transaction mock propagates the error
      // (the callback throws → the mock's async wrapper re-throws → route's outer
      // catch returns 500). This proves audit failure rolls back atomically.
      const existing = {
        id: "lp-1",
        workshopId: "workshop-1",
        template: "SOLO_LANDING",
        slug: "x",
        content: "{}",
        status: "DRAFT",
        publishedAt: null,
        customHtml: "<p>old</p>",
      };
      (db.landingPage.findUnique as jest.Mock).mockResolvedValueOnce(existing);
      (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      // Simulate the audit write failing inside the transaction.
      txAuditLogCreate.mockRejectedValueOnce(new Error("DB constraint error"));

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>new</p>",
          expectedCustomHtml: "<p>old</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      // The route must not return success:true — the write failed.
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Group H — no-row first save (R1-HIGH-1 + R2-HIGH-2)
  // -------------------------------------------------------------------------
  describe("no-row first save", () => {
    it("no existing row + no expectedCustomHtml → creates row with sanitized customHtml + valid content (200)", async () => {
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        { customCode: null, customHtml: "<p>tmpl</p>", categoryId: null, content: '{"hero":"default"}' },
      ]);
      (db.landingPage.create as jest.Mock).mockImplementation((args: { data: unknown }) =>
        Promise.resolve({ id: "lp-new", ...(args.data as object) })
      );
      txAuditLogCreate.mockResolvedValue({ id: "audit-1" });

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>fresh</p><script>x()</script>",
          // no expectedCustomHtml — allowed on create
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect([200, 201]).toContain(response.status);
      const created = (db.landingPage.create as jest.Mock).mock.calls[0][0].data;
      // content must be valid parseable JSON (synthesized, not undefined).
      expect(typeof created.content).toBe("string");
      expect(() => JSON.parse(created.content)).not.toThrow();
      // sanitized customHtml stored.
      expect(created.customHtml).not.toMatch(/<script/i);
      expect(created.customHtml).toContain("<p>fresh</p>");
      // prior-body audit row written through tx (not global db).
      expect(txAuditLogCreate).toHaveBeenCalledTimes(1);
      const auditArg = txAuditLogCreate.mock.calls[0][0].data;
      const changes = JSON.parse(auditArg.changes);
      expect(changes.previousCustomHtml).toBeNull();
      expect(changes.op).toBe("save");
    });

    it("concurrent second create (Prisma P2002) → 409", async () => {
      (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
      (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
        { customCode: null, customHtml: null, categoryId: null, content: "{}" },
      ]);
      const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      (db.landingPage.create as jest.Mock).mockRejectedValue(p2002);

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: "<p>x</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(409);
    });

    it("clearing customHtml (null) on existing row → stores null", async () => {
      const existing = {
        id: "lp-1",
        workshopId: "workshop-1",
        template: "SOLO_LANDING",
        slug: "x",
        content: "{}",
        status: "DRAFT",
        publishedAt: null,
        customHtml: "<p>old</p>",
      };
      (db.landingPage.findUnique as jest.Mock)
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ ...existing, customHtml: null });
      (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      txAuditLogCreate.mockResolvedValue({ id: "audit-1" });

      const response = await PUT(
        buildPutRequest("workshop-1", "SOLO_LANDING", {
          customHtml: null,
          expectedCustomHtml: "<p>old</p>",
        }),
        routeParams("workshop-1", "SOLO_LANDING")
      );

      expect(response.status).toBe(200);
      const data = (db.landingPage.updateMany as jest.Mock).mock.calls[0][0].data;
      expect(data.customHtml).toBeNull();
    });
  });
});

// ============================================================================
// Wave B Task 3 — GET ?resolved=1, capability marker, restore action
// ============================================================================

// Helper: a landing page row with per-workshop customHtml override.
function resolvedLandingPage(customHtml: string | null = "<p>stored-override</p>") {
  return {
    id: "lp-3",
    workshopId: "workshop-1",
    template: "SOLO_LANDING",
    slug: "x",
    content: "{}",
    status: "DRAFT",
    publishedAt: null,
    customHtml,
  };
}

// A PageTemplate row whose customHtml the resolved mode should use.
const activePageTemplate = {
  customCode: null,
  customHtml: "<p>Hello {{workshop_title}}</p>",
  categoryId: null,
  content: '{"hero":"default"}',
};

describe("Wave B Task 3 — GET ?resolved=1 (resolved mode)", () => {
  const FLAG = "WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED";
  const originalFlag = process.env[FLAG];

  beforeEach(() => {
    jest.clearAllMocks();
    process.env[FLAG] = "1";
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (canManageCoachData as jest.Mock).mockReturnValue(true);
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(fakeWorkshop);
    // Default: active template with customHtml.
    (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([activePageTemplate]);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue(resolvedLandingPage());
  });

  afterAll(() => {
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  it("privileged GET ?resolved=1 returns customHtmlResolved from template (not stored override)", async () => {
    const response = await GET(
      buildGetRequest("workshop-1", "SOLO_LANDING", { resolved: "1" }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    // Must come from template interpolation (workshop_title resolved), NOT from stored LandingPage.customHtml.
    expect(body.customHtmlResolved).toContain("Test Workshop");
    // Must NOT echo the stored per-workshop override.
    expect(body.customHtmlResolved).not.toContain("stored-override");
  });

  it("resolved mode with no active template customHtml → customHtmlResolved is empty string", async () => {
    (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([
      { ...activePageTemplate, customHtml: null },
    ]);

    const response = await GET(
      buildGetRequest("workshop-1", "SOLO_LANDING", { resolved: "1" }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.customHtmlResolved).toBe("");
  });

  it("resolved mode with no active template at all → customHtmlResolved is empty string", async () => {
    (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET(
      buildGetRequest("workshop-1", "SOLO_LANDING", { resolved: "1" }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.customHtmlResolved).toBe("");
  });

  it("coach GET ?resolved=1 → 403", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);

    const response = await GET(
      buildGetRequest("workshop-1", "SOLO_LANDING", { resolved: "1" }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(403);
  });

  it("flag OFF + GET ?resolved=1 → 404", async () => {
    delete process.env[FLAG];

    const response = await GET(
      buildGetRequest("workshop-1", "SOLO_LANDING", { resolved: "1" }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect([404]).toContain(response.status);
    process.env[FLAG] = "1";
  });

  it("resolved mode always regenerates from template, not from stored LandingPage.customHtml", async () => {
    // Stored override is different from what the template would produce.
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue(
      resolvedLandingPage("<p>totally-different-stored-override</p>")
    );

    const response = await GET(
      buildGetRequest("workshop-1", "SOLO_LANDING", { resolved: "1" }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    // Must use template content (not the stored override).
    expect(body.customHtmlResolved).toContain("Test Workshop");
    expect(body.customHtmlResolved).not.toContain("totally-different-stored-override");
  });

  it("category precedence: category-scoped template wins over null-categoryId template", async () => {
    const globalTemplate = { ...activePageTemplate, customHtml: "<p>global</p>", categoryId: null };
    const categoryTemplate = {
      ...activePageTemplate,
      customHtml: "<p>category {{workshop_title}}</p>",
      categoryId: "cat-1",
    };
    // Category-scoped workshop.
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      ...fakeWorkshop,
      categoryId: "cat-1",
    });
    (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([globalTemplate, categoryTemplate]);

    const response = await GET(
      buildGetRequest("workshop-1", "SOLO_LANDING", { resolved: "1" }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.customHtmlResolved).toContain("category");
    expect(body.customHtmlResolved).not.toContain("global");
  });
});

// ============================================================================
// Wave B Task 3 — capability marker (customHtmlEditor field on GET)
// ============================================================================

describe("Wave B Task 3 — capability marker (customHtmlEditor)", () => {
  const FLAG = "WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED";
  const originalFlag = process.env[FLAG];

  beforeEach(() => {
    jest.clearAllMocks();
    process.env[FLAG] = "1";
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (canManageCoachData as jest.Mock).mockReturnValue(true);
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(fakeWorkshop);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue(resolvedLandingPage());
  });

  afterAll(() => {
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  it("privileged + flag ON → normal GET includes customHtmlEditor: true", async () => {
    const response = await GET(
      buildGetRequest("workshop-1", "SOLO_LANDING"),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.customHtmlEditor).toBe(true);
  });

  it("coach + flag ON → normal GET does NOT include customHtmlEditor: true", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);

    const response = await GET(
      buildGetRequest("workshop-1", "SOLO_LANDING"),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    // Coach must NOT see the editor capability.
    expect(body.customHtmlEditor).not.toBe(true);
  });

  it("privileged + flag OFF → normal GET does NOT include customHtmlEditor: true", async () => {
    delete process.env[FLAG];

    const response = await GET(
      buildGetRequest("workshop-1", "SOLO_LANDING"),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.customHtmlEditor).not.toBe(true);
    process.env[FLAG] = "1";
  });

  it("resolved mode also includes customHtmlEditor: true for privileged + flag ON", async () => {
    (db.pageTemplate.findMany as jest.Mock).mockResolvedValue([activePageTemplate]);

    const response = await GET(
      buildGetRequest("workshop-1", "SOLO_LANDING", { resolved: "1" }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.customHtmlEditor).toBe(true);
  });

  // Addition 2 — data: null capability-marker branch:
  // The GET handler has a specific branch for when no LandingPage row exists yet
  // (data: null). Capability marker tests above all seed a non-null page. These
  // tests cover the no-row path.

  it("no landing-page row + privileged + flag ON → data: null response includes customHtmlEditor: true", async () => {
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      buildGetRequest("workshop-1", "SOLO_LANDING"),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.customHtmlEditor).toBe(true);
  });

  it("no landing-page row + flag OFF → data: null response does NOT include customHtmlEditor: true", async () => {
    delete process.env[FLAG];
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      buildGetRequest("workshop-1", "SOLO_LANDING"),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.customHtmlEditor).not.toBe(true);
    process.env[FLAG] = "1";
  });

  it("no landing-page row + coach + flag ON → data: null response does NOT include customHtmlEditor: true", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      buildGetRequest("workshop-1", "SOLO_LANDING"),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.customHtmlEditor).not.toBe(true);
  });
});

// ============================================================================
// Wave B Task 3 — restore action (?action=restore-html on PUT)
// ============================================================================

describe("Wave B Task 3 — restore action", () => {
  const FLAG = "WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED";
  const originalFlag = process.env[FLAG];

  // Wire the transaction for restore tests — uses txRestoreAuditLogCreate so we
  // can distinguish restore audit writes from save-path writes.
  function wireRestoreTransaction() {
    (db.$transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        landingPage: {
          updateMany: db.landingPage.updateMany,
          findUnique: db.landingPage.findUnique,
          create: db.landingPage.create,
        },
        auditLog: {
          create: txRestoreAuditLogCreate,
        },
      })
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env[FLAG] = "1";
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (canManageCoachData as jest.Mock).mockReturnValue(true);
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(fakeWorkshop);
    wireRestoreTransaction();
  });

  afterAll(() => {
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  it("restore with prior audit row → reverts to previousCustomHtml, writes op:restore audit", async () => {
    const currentPage = resolvedLandingPage("<p>current</p>");
    (db.landingPage.findUnique as jest.Mock)
      .mockResolvedValueOnce(currentPage) // pre-restore existing
      .mockResolvedValueOnce({ ...currentPage, customHtml: "<p>previous</p>" }); // post-tx re-read
    (db.auditLog.findFirst as jest.Mock).mockResolvedValue({
      id: "audit-1",
      entityType: "LandingPage",
      entityId: "lp-3",
      action: "UPDATE_CUSTOM_HTML",
      changes: JSON.stringify({ op: "save", previousCustomHtml: "<p>previous</p>" }),
    });
    (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    txRestoreAuditLogCreate.mockResolvedValue({ id: "audit-restore-1" });

    const response = await PUT(
      buildRestorePutRequest("workshop-1", "SOLO_LANDING", {
        expectedCustomHtml: "<p>current</p>",
      }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(200);
    // The write must target the prior sanitized value.
    const writeData = (db.landingPage.updateMany as jest.Mock).mock.calls[0][0].data;
    expect(writeData.customHtml).toBe("<p>previous</p>");
    // Audit row must carry op:restore.
    expect(txRestoreAuditLogCreate).toHaveBeenCalledTimes(1);
    const auditArg = txRestoreAuditLogCreate.mock.calls[0][0].data;
    const changes = JSON.parse(auditArg.changes);
    expect(changes.op).toBe("restore");
  });

  it("restore with no prior audit row → 404", async () => {
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue(resolvedLandingPage("<p>x</p>"));
    (db.auditLog.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await PUT(
      buildRestorePutRequest("workshop-1", "SOLO_LANDING", {
        expectedCustomHtml: "<p>x</p>",
      }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(404);
  });

  it("entity-binding: auditLog.findFirst is always called with THIS page's entityId (not a foreign id)", async () => {
    const currentPage = resolvedLandingPage("<p>current</p>");
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue(currentPage);
    // Simulate no matching audit row for this page (the DB returns null because the
    // query is scoped to entityId="lp-3" and no row exists for it). In the real DB,
    // a row with entityId="lp-FOREIGN" would never be returned by a query filtered
    // to entityId="lp-3" — the mock proves the route sends the correct filter.
    (db.auditLog.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await PUT(
      buildRestorePutRequest("workshop-1", "SOLO_LANDING", {
        expectedCustomHtml: "<p>current</p>",
      }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    // Route must have queried with THIS page's entityId.
    const findFirstArg = (db.auditLog.findFirst as jest.Mock).mock.calls[0][0];
    expect(findFirstArg.where.entityId).toBe("lp-3");
    expect(findFirstArg.where.action).toBe("UPDATE_CUSTOM_HTML");
    // No prior row → 404 (no write happened).
    expect(response.status).toBe(404);
    expect((db.landingPage.updateMany as jest.Mock)).not.toHaveBeenCalled();
  });

  it("coach PUT ?action=restore-html → 403", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue(resolvedLandingPage("<p>x</p>"));

    const response = await PUT(
      buildRestorePutRequest("workshop-1", "SOLO_LANDING", {
        expectedCustomHtml: "<p>x</p>",
      }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(403);
  });

  it("flag OFF + restore → 404", async () => {
    delete process.env[FLAG];
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue(resolvedLandingPage("<p>x</p>"));

    const response = await PUT(
      buildRestorePutRequest("workshop-1", "SOLO_LANDING", {
        expectedCustomHtml: "<p>x</p>",
      }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect([404]).toContain(response.status);
    process.env[FLAG] = "1";
  });

  it("restore re-sanitizes prior body (XSS in audit changes.previousCustomHtml is stripped)", async () => {
    const currentPage = resolvedLandingPage("<p>current</p>");
    (db.landingPage.findUnique as jest.Mock)
      .mockResolvedValueOnce(currentPage)
      .mockResolvedValueOnce({ ...currentPage, customHtml: "<p>clean</p>" });
    (db.auditLog.findFirst as jest.Mock).mockResolvedValue({
      id: "audit-1",
      entityType: "LandingPage",
      entityId: "lp-3",
      action: "UPDATE_CUSTOM_HTML",
      // Tampered audit row: previousCustomHtml contains XSS.
      changes: JSON.stringify({
        op: "save",
        previousCustomHtml: '<p>clean</p><script>evil()</script>',
      }),
    });
    (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    txRestoreAuditLogCreate.mockResolvedValue({ id: "audit-restore-1" });

    const response = await PUT(
      buildRestorePutRequest("workshop-1", "SOLO_LANDING", {
        expectedCustomHtml: "<p>current</p>",
      }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(200);
    // The stored value must be sanitized — no <script> despite being in the audit log.
    const writeData = (db.landingPage.updateMany as jest.Mock).mock.calls[0][0].data;
    expect(writeData.customHtml).not.toMatch(/<script/i);
  });

  it("CAS mismatch on restore → 409", async () => {
    const currentPage = resolvedLandingPage("<p>actual-current</p>");
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue(currentPage);
    (db.auditLog.findFirst as jest.Mock).mockResolvedValue({
      id: "audit-1",
      entityType: "LandingPage",
      entityId: "lp-3",
      action: "UPDATE_CUSTOM_HTML",
      changes: JSON.stringify({ op: "save", previousCustomHtml: "<p>previous</p>" }),
    });
    // Simulate that stored value already changed (CAS mismatch → count 0).
    (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const response = await PUT(
      buildRestorePutRequest("workshop-1", "SOLO_LANDING", {
        expectedCustomHtml: "<p>WRONG</p>",
      }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(response.status).toBe(409);
  });

  // Addition 1 — entity-binding behavioral negative:
  // The query layer returns a foreign row (entityId/previousCustomHtml reference a
  // different page), but the restore write target must still be THIS page's id ("lp-3"),
  // because the route derives the write target from existingPage.id (loaded via the
  // workshopId+template composite key), NOT from the audit row contents.
  it("entity-binding behavioral: foreign audit row returned → write is still keyed to THIS page (lp-3), not the foreign page", async () => {
    const thisPage = resolvedLandingPage("<p>current</p>");
    (db.landingPage.findUnique as jest.Mock)
      .mockResolvedValueOnce(thisPage)                                         // pre-restore page load
      .mockResolvedValueOnce({ ...thisPage, customHtml: "<p>foreign body</p>" }); // post-tx re-read
    // Simulates a misbehaving query layer: findFirst hands back a row that belongs to
    // a different page (its entityId conceptually references "lp-FOREIGN").
    (db.auditLog.findFirst as jest.Mock).mockResolvedValue({
      id: "audit-foreign",
      entityType: "LandingPage",
      entityId: "lp-FOREIGN",
      action: "UPDATE_CUSTOM_HTML",
      changes: JSON.stringify({ op: "save", previousCustomHtml: "<p>foreign body</p>" }),
    });
    (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    txRestoreAuditLogCreate.mockResolvedValue({ id: "audit-restore-1" });

    const response = await PUT(
      buildRestorePutRequest("workshop-1", "SOLO_LANDING", {
        expectedCustomHtml: "<p>current</p>",
      }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    // Route completes (the foreign body is usable content — sanitizer passes it).
    expect(response.status).toBe(200);

    // The write WHERE clause must reference THIS page's id, not the foreign id.
    const updateManyCall = (db.landingPage.updateMany as jest.Mock).mock.calls[0][0];
    expect(updateManyCall.where.id).toBe("lp-3");
    expect(updateManyCall.where.id).not.toBe("lp-FOREIGN");

    // The audit row entityId written by the restore must also reference THIS page.
    const auditData = txRestoreAuditLogCreate.mock.calls[0][0].data;
    expect(auditData.entityId).toBe("lp-3");
    expect(auditData.entityId).not.toBe("lp-FOREIGN");
  });

  it("save→restore→restore chain: each restore reverts to the previous prior body", async () => {
    // Simulate audit log state at the time of each restore call.
    // State: A (original) → saved B → saved C → restore1 reverts to B → restore2 reverts to C.

    // --- Restore 1: C → B ---
    const pageAtC = resolvedLandingPage("<p>C</p>");
    // Page at B (what we revert to).
    const pageAtB = resolvedLandingPage("<p>B</p>");
    (db.landingPage.findUnique as jest.Mock)
      .mockResolvedValueOnce(pageAtC)    // restore1 pre-load
      .mockResolvedValueOnce(pageAtB);   // restore1 post-tx re-read
    // The LATEST audit row scoped to this page shows prev=B (save B→C snapshotted prevB).
    (db.auditLog.findFirst as jest.Mock).mockResolvedValueOnce({
      id: "audit-saveC",
      entityType: "LandingPage",
      entityId: "lp-3",
      action: "UPDATE_CUSTOM_HTML",
      changes: JSON.stringify({ op: "save", previousCustomHtml: "<p>B</p>" }),
    });
    (db.landingPage.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    txRestoreAuditLogCreate.mockResolvedValueOnce({ id: "audit-restore1" });

    const restore1 = await PUT(
      buildRestorePutRequest("workshop-1", "SOLO_LANDING", {
        expectedCustomHtml: "<p>C</p>",
      }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(restore1.status).toBe(200);
    const r1WriteData = (db.landingPage.updateMany as jest.Mock).mock.calls[0][0].data;
    expect(r1WriteData.customHtml).toBe("<p>B</p>");
    const r1AuditChanges = JSON.parse(txRestoreAuditLogCreate.mock.calls[0][0].data.changes);
    expect(r1AuditChanges.op).toBe("restore");
    // previousCustomHtml in the restore1 audit row must be C (the value that was replaced).
    expect(r1AuditChanges.previousCustomHtml).toBe("<p>C</p>");

    // --- Restore 2: B → C (redo) ---
    jest.clearAllMocks();
    wireRestoreTransaction();

    // After restore1, page is now B. The LATEST audit row is the restore1 audit row
    // (action: UPDATE_CUSTOM_HTML, op: restore) which snapshotted prev=C.
    (db.landingPage.findUnique as jest.Mock)
      .mockResolvedValueOnce(pageAtB)    // restore2 pre-load
      .mockResolvedValueOnce(pageAtC);   // restore2 post-tx re-read
    (db.auditLog.findFirst as jest.Mock).mockResolvedValueOnce({
      id: "audit-restore1",
      entityType: "LandingPage",
      entityId: "lp-3",
      action: "UPDATE_CUSTOM_HTML",
      changes: JSON.stringify({ op: "restore", previousCustomHtml: "<p>C</p>" }),
    });
    (db.landingPage.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    txRestoreAuditLogCreate.mockResolvedValueOnce({ id: "audit-restore2" });

    const restore2 = await PUT(
      buildRestorePutRequest("workshop-1", "SOLO_LANDING", {
        expectedCustomHtml: "<p>B</p>",
      }),
      routeParams("workshop-1", "SOLO_LANDING")
    );

    expect(restore2.status).toBe(200);
    const r2WriteData = (db.landingPage.updateMany as jest.Mock).mock.calls[0][0].data;
    expect(r2WriteData.customHtml).toBe("<p>C</p>");
    const r2AuditChanges = JSON.parse(txRestoreAuditLogCreate.mock.calls[0][0].data.changes);
    expect(r2AuditChanges.op).toBe("restore");
  });
});
