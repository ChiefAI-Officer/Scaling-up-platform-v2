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
    landingPage: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { DELETE, PATCH } from "@/app/api/landing-pages/[id]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/authorization";

function routeParams(id = "page-1") {
  return { params: Promise.resolve({ id }) };
}

function buildDeleteRequest(): Parameters<typeof DELETE>[0] {
  return new Request("http://localhost/api/landing-pages/page-1", {
    method: "DELETE",
  }) as unknown as Parameters<typeof DELETE>[0];
}

function buildPatchRequest(
  body: Record<string, unknown>,
  id = "page-1"
): Parameters<typeof PATCH>[0] {
  return new Request(`http://localhost/api/landing-pages/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof PATCH>[0];
}

const adminActor = {
  userId: "admin-user",
  email: "admin@example.com",
  role: "ADMIN",
  coachId: null,
};

describe("DELETE /api/landing-pages/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 404 for non-admin users to avoid enumeration", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "coach-user",
      email: "coach@example.com",
      role: "COACH",
      coachId: "coach-1",
    });

    const response = await DELETE(buildDeleteRequest(), routeParams("page-1"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Landing page not found");
    expect(db.landingPage.findUnique).not.toHaveBeenCalled();
    expect(db.landingPage.delete).not.toHaveBeenCalled();
  });

  it("blocks deletion of active template pages", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
      id: "page-1",
      isActiveTemplate: true,
    });

    const response = await DELETE(buildDeleteRequest(), routeParams("page-1"));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("Active template pages cannot be deleted");
    expect(db.landingPage.delete).not.toHaveBeenCalled();
  });

  it("deletes non-active pages for admins", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
      id: "page-1",
      isActiveTemplate: false,
    });
    (db.landingPage.delete as jest.Mock).mockResolvedValue({ id: "page-1" });

    const response = await DELETE(buildDeleteRequest(), routeParams("page-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(db.landingPage.delete).toHaveBeenCalledWith({
      where: { id: "page-1" },
    });
  });
});

describe("PATCH /api/landing-pages/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildPatchRequest({ isActiveTemplate: true }),
      routeParams("page-1")
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Authentication required");
  });

  it("returns 403 for non-admin users", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "coach-user",
      email: "coach@example.com",
      role: "COACH",
      coachId: "coach-1",
    });

    const response = await PATCH(
      buildPatchRequest({ isActiveTemplate: true }),
      routeParams("page-1")
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 404 when page does not exist", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildPatchRequest({ isActiveTemplate: true }),
      routeParams("nonexistent")
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Landing page not found");
  });

  it("uses $transaction to deactivate competing template when activating", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
      id: "page-1",
      template: "WORKSHOP",
      categoryId: null,
      isActiveTemplate: false,
    });

    const activatedPage = {
      id: "page-1",
      template: "WORKSHOP",
      categoryId: null,
      isActiveTemplate: true,
    };

    // Interactive transaction: invoke the callback with the db mock as the tx proxy
    (db.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => {
      (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (db.landingPage.update as jest.Mock).mockResolvedValue(activatedPage);
      return fn(db);
    });

    const response = await PATCH(
      buildPatchRequest({ isActiveTemplate: true }),
      routeParams("page-1")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.page).toEqual(activatedPage);

    // $transaction should have been called once with a callback
    expect(db.$transaction).toHaveBeenCalledTimes(1);

    // The updateMany call inside the transaction should target the same slot
    expect(db.landingPage.updateMany).toHaveBeenCalledWith({
      where: {
        template: "WORKSHOP",
        categoryId: null,
        isActiveTemplate: true,
        id: { not: "page-1" },
      },
      data: { isActiveTemplate: false },
    });

    // The update call should activate the target page (no categoryId change since none provided)
    expect(db.landingPage.update).toHaveBeenCalledWith({
      where: { id: "page-1" },
      data: { isActiveTemplate: true },
    });
  });

  it("re-scopes page to a new categoryId when provided with isActiveTemplate: true", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
      id: "page-2",
      template: "WORKSHOP",
      categoryId: null, // currently global
      isActiveTemplate: false,
    });

    const activatedPage = {
      id: "page-2",
      template: "WORKSHOP",
      categoryId: "cat-abc",
      isActiveTemplate: true,
    };
    (db.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => {
      (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (db.landingPage.update as jest.Mock).mockResolvedValue(activatedPage);
      return fn(db);
    });

    const response = await PATCH(
      buildPatchRequest({ isActiveTemplate: true, categoryId: "cat-abc" }),
      routeParams("page-2")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.page.categoryId).toBe("cat-abc");

    // The updateMany should use the NEW categoryId as the slot filter
    expect(db.landingPage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoryId: "cat-abc" }),
      })
    );

    // The update should persist the new categoryId
    expect(db.landingPage.update).toHaveBeenCalledWith({
      where: { id: "page-2" },
      data: { isActiveTemplate: true, categoryId: "cat-abc" },
    });
  });

  it("performs simple update (no transaction) when isActiveTemplate is false", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
      id: "page-3",
      template: "WORKSHOP",
      categoryId: null,
      isActiveTemplate: true,
    });

    const deactivatedPage = {
      id: "page-3",
      template: "WORKSHOP",
      categoryId: null,
      isActiveTemplate: false,
    };
    (db.landingPage.update as jest.Mock).mockResolvedValue(deactivatedPage);

    const response = await PATCH(
      buildPatchRequest({ isActiveTemplate: false }),
      routeParams("page-3")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.page.isActiveTemplate).toBe(false);

    // No transaction — direct update
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.landingPage.update).toHaveBeenCalledWith({
      where: { id: "page-3" },
      data: { isActiveTemplate: false },
    });
  });

  it("categoryId-only PATCH on currently-active page triggers deactivation transaction", async () => {
    // An already-active page being re-scoped to a new category should atomically deactivate
    // any competing active template in the new slot — even when isActiveTemplate is not in the payload.
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
      id: "page-4",
      template: "WORKSHOP",
      categoryId: "cat-old",
      isActiveTemplate: true, // page is currently active
    });

    const rescoped = {
      id: "page-4",
      template: "WORKSHOP",
      categoryId: "cat-new",
      isActiveTemplate: true,
    };
    (db.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => {
      (db.landingPage.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (db.landingPage.update as jest.Mock).mockResolvedValue(rescoped);
      return fn(db);
    });

    const response = await PATCH(
      buildPatchRequest({ categoryId: "cat-new" }), // no isActiveTemplate in payload
      routeParams("page-4")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.page.categoryId).toBe("cat-new");

    // Must use transaction (not a plain update) to deactivate competitors in the new slot
    expect(db.$transaction).toHaveBeenCalledTimes(1);

    // updateMany should target the NEW category slot to clear competitors
    expect(db.landingPage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoryId: "cat-new",
          template: "WORKSHOP",
          isActiveTemplate: true,
          id: { not: "page-4" },
        }),
      })
    );

    // update should persist the new categoryId
    expect(db.landingPage.update).toHaveBeenCalledWith({
      where: { id: "page-4" },
      data: { categoryId: "cat-new" },
    });

    // No direct (non-transaction) update call
    expect(db.landingPage.update).toHaveBeenCalledTimes(1);
  });

  it("categoryId-only PATCH on inactive page does NOT trigger transaction", async () => {
    // An inactive page being re-scoped should not run the deactivation transaction.
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
      id: "page-5",
      template: "WORKSHOP",
      categoryId: "cat-old",
      isActiveTemplate: false, // page is currently inactive
    });

    const updated = {
      id: "page-5",
      template: "WORKSHOP",
      categoryId: "cat-new",
      isActiveTemplate: false,
    };
    (db.landingPage.update as jest.Mock).mockResolvedValue(updated);

    const response = await PATCH(
      buildPatchRequest({ categoryId: "cat-new" }), // no isActiveTemplate in payload
      routeParams("page-5")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.page.categoryId).toBe("cat-new");

    // No transaction needed for an inactive page re-scope
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.landingPage.update).toHaveBeenCalledWith({
      where: { id: "page-5" },
      data: { categoryId: "cat-new" },
    });
  });

  it("returns 400 for invalid payload", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);

    const response = await PATCH(
      buildPatchRequest({ isActiveTemplate: "yes" }), // should be boolean
      routeParams("page-1")
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Validation error");
  });
});
