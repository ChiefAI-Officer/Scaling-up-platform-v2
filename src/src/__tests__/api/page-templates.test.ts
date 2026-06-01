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
        pageTemplate: {
            findUnique: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        $transaction: jest.fn(),
    },
}));

jest.mock("@/lib/auth/authorization", () => ({
    getApiActor: jest.fn(),
    isPrivilegedRole: (r: string) => r === "ADMIN" || r === "STAFF",
}));

jest.mock("@/lib/audit", () => ({
    logAudit: jest.fn(),
}));

jest.mock("@/lib/templates/sanitize-custom-html", () => ({
    sanitizeCustomHtml: jest.fn(),
}));

import { PATCH } from "@/app/api/page-templates/[id]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";
import { sanitizeCustomHtml } from "@/lib/templates/sanitize-custom-html";

function routeParams(id: string) {
    return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/page-templates/[id]", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (getApiActor as jest.Mock).mockResolvedValue({
            userId: "admin-1",
            email: "admin@test.com",
            role: "ADMIN",
        });
    });

    it("rejects content update when no {{placeholders}} found", async () => {
        (db.pageTemplate.findUnique as jest.Mock).mockResolvedValue({
            id: "tpl-1",
            templateType: "SOLO_LANDING",
            categoryId: null,
        });

        const req = new Request("http://localhost/api/page-templates/tpl-1", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: '{"heroTitle":"Real Workshop Name"}' }),
        });

        const res = await PATCH(req, routeParams("tpl-1"));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toMatch(/placeholders/i);
    });

    it("allows content update when {{placeholders}} are present", async () => {
        (db.pageTemplate.findUnique as jest.Mock)
            .mockResolvedValueOnce({ id: "tpl-1", templateType: "SOLO_LANDING", categoryId: null })
            .mockResolvedValueOnce({ id: "tpl-1", templateType: "SOLO_LANDING", content: '{"heroTitle":"{{workshop_title}}"}' });
        (db.pageTemplate.update as jest.Mock).mockResolvedValue({});

        const req = new Request("http://localhost/api/page-templates/tpl-1", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: '{"heroTitle":"{{workshop_title}}"}' }),
        });

        const res = await PATCH(req, routeParams("tpl-1"));
        expect(res.status).toBe(200);
    });
});

describe("PATCH /api/page-templates/[id] — customHtml", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (getApiActor as jest.Mock).mockResolvedValue({
            userId: "admin-1",
            email: "admin@test.com",
            role: "ADMIN",
        });
        (db.pageTemplate.update as jest.Mock).mockResolvedValue({});
        (db.$transaction as jest.Mock).mockImplementation(async (cb: (tx: typeof db) => Promise<unknown>) => {
            return cb(db);
        });
    });

    function mockExistingTemplate(templateType: string) {
        (db.pageTemplate.findUnique as jest.Mock)
            .mockResolvedValueOnce({ id: "tpl-1", templateType, categoryId: null })
            .mockResolvedValueOnce({ id: "tpl-1", templateType, customHtml: "<p>x</p>" });
    }

    function patchReq(payload: unknown) {
        return new Request("http://localhost/api/page-templates/tpl-1", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    }

    it("stores clean customHtml on SOLO_LANDING and reports not sanitized", async () => {
        mockExistingTemplate("SOLO_LANDING");
        (sanitizeCustomHtml as jest.Mock).mockReturnValue({
            sanitized: "<p>hi {{workshop_title}}</p>",
            didStripContent: false,
            strippedTags: [],
            strippedAttrs: [],
        });

        const res = await PATCH(patchReq({ customHtml: "<p>hi {{workshop_title}}</p>" }), routeParams("tpl-1"));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.customHtmlSanitized).toBe(false);
        expect(sanitizeCustomHtml as jest.Mock).toHaveBeenCalledWith("<p>hi {{workshop_title}}</p>");
        const updateCall = (db.pageTemplate.update as jest.Mock).mock.calls[0][0];
        expect(updateCall.data.customHtml).toBe("<p>hi {{workshop_title}}</p>");
    });

    it("stores sanitized output (not raw) when script is stripped on SOLO_LANDING", async () => {
        mockExistingTemplate("SOLO_LANDING");
        (sanitizeCustomHtml as jest.Mock).mockReturnValue({
            sanitized: "<p>safe</p>",
            didStripContent: true,
            strippedTags: ["script"],
            strippedAttrs: [],
        });

        const res = await PATCH(patchReq({ customHtml: "<script>x</script><p>safe</p>" }), routeParams("tpl-1"));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.customHtmlSanitized).toBe(true);
        const updateCall = (db.pageTemplate.update as jest.Mock).mock.calls[0][0];
        expect(updateCall.data.customHtml).toBe("<p>safe</p>");
    });

    it("rejects customHtml on REGISTRATION template", async () => {
        (db.pageTemplate.findUnique as jest.Mock).mockResolvedValueOnce({
            id: "tpl-1",
            templateType: "REGISTRATION",
            categoryId: null,
        });

        const res = await PATCH(patchReq({ customHtml: "<p>x</p>" }), routeParams("tpl-1"));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toMatch(/SOLO_LANDING and DUO_LANDING/);
        expect(db.pageTemplate.update as jest.Mock).not.toHaveBeenCalled();
    });

    it("rejects customHtml on THANK_YOU template", async () => {
        (db.pageTemplate.findUnique as jest.Mock).mockResolvedValueOnce({
            id: "tpl-1",
            templateType: "THANK_YOU",
            categoryId: null,
        });

        const res = await PATCH(patchReq({ customHtml: "<p>x</p>" }), routeParams("tpl-1"));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toMatch(/SOLO_LANDING and DUO_LANDING/);
        expect(db.pageTemplate.update as jest.Mock).not.toHaveBeenCalled();
    });

    it("rejects customHtml on BIO_PAGE template", async () => {
        (db.pageTemplate.findUnique as jest.Mock).mockResolvedValueOnce({
            id: "tpl-1",
            templateType: "BIO_PAGE",
            categoryId: null,
        });

        const res = await PATCH(patchReq({ customHtml: "<p>x</p>" }), routeParams("tpl-1"));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toMatch(/SOLO_LANDING and DUO_LANDING/);
        expect(db.pageTemplate.update as jest.Mock).not.toHaveBeenCalled();
    });

    it("allows customHtml on DUO_LANDING template", async () => {
        mockExistingTemplate("DUO_LANDING");
        (sanitizeCustomHtml as jest.Mock).mockReturnValue({
            sanitized: "<p>x</p>",
            didStripContent: false,
            strippedTags: [],
            strippedAttrs: [],
        });

        const res = await PATCH(patchReq({ customHtml: "<p>x</p>" }), routeParams("tpl-1"));
        expect(res.status).toBe(200);
    });

    it("normalizes empty string customHtml to null and skips sanitizer", async () => {
        mockExistingTemplate("SOLO_LANDING");

        const res = await PATCH(patchReq({ customHtml: "" }), routeParams("tpl-1"));

        expect(res.status).toBe(200);
        expect(sanitizeCustomHtml as jest.Mock).not.toHaveBeenCalled();
        const updateCall = (db.pageTemplate.update as jest.Mock).mock.calls[0][0];
        expect(updateCall.data.customHtml).toBeNull();
    });

    it("normalizes whitespace-only customHtml to null and skips sanitizer", async () => {
        mockExistingTemplate("SOLO_LANDING");

        const res = await PATCH(patchReq({ customHtml: "   \n\t  " }), routeParams("tpl-1"));

        expect(res.status).toBe(200);
        expect(sanitizeCustomHtml as jest.Mock).not.toHaveBeenCalled();
        const updateCall = (db.pageTemplate.update as jest.Mock).mock.calls[0][0];
        expect(updateCall.data.customHtml).toBeNull();
    });

    it("passes through null customHtml unchanged and skips sanitizer", async () => {
        mockExistingTemplate("SOLO_LANDING");

        const res = await PATCH(patchReq({ customHtml: null }), routeParams("tpl-1"));

        expect(res.status).toBe(200);
        expect(sanitizeCustomHtml as jest.Mock).not.toHaveBeenCalled();
        const updateCall = (db.pageTemplate.update as jest.Mock).mock.calls[0][0];
        expect(updateCall.data.customHtml).toBeNull();
    });

    it("allows non-placeholder content when customHtml is non-empty (escape hatch)", async () => {
        mockExistingTemplate("SOLO_LANDING");
        (sanitizeCustomHtml as jest.Mock).mockReturnValue({
            sanitized: "<p>x</p>",
            didStripContent: false,
            strippedTags: [],
            strippedAttrs: [],
        });

        const res = await PATCH(
            patchReq({ content: "no placeholders here", customHtml: "<p>x</p>" }),
            routeParams("tpl-1"),
        );
        expect(res.status).toBe(200);
    });

    it("still rejects non-placeholder content when customHtml is empty", async () => {
        (db.pageTemplate.findUnique as jest.Mock).mockResolvedValueOnce({
            id: "tpl-1",
            templateType: "SOLO_LANDING",
            categoryId: null,
        });

        const res = await PATCH(
            patchReq({ content: "no placeholders", customHtml: "" }),
            routeParams("tpl-1"),
        );
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toMatch(/placeholders/i);
    });

    it("rejects customHtml exceeding 500,000 character limit", async () => {
        const tooLong = "x".repeat(500_001);

        const res = await PATCH(patchReq({ customHtml: tooLong }), routeParams("tpl-1"));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toMatch(/500,000 character limit/);
        expect(sanitizeCustomHtml as jest.Mock).not.toHaveBeenCalled();
    });

    it("populates audit changes blob with sanitization metadata", async () => {
        mockExistingTemplate("SOLO_LANDING");
        (sanitizeCustomHtml as jest.Mock).mockReturnValue({
            sanitized: "<p>x</p>",
            didStripContent: true,
            strippedTags: ["script"],
            strippedAttrs: ["onerror"],
        });

        await PATCH(patchReq({ customHtml: "<script>...</script>" }), routeParams("tpl-1"));

        const auditCall = (logAudit as jest.Mock).mock.calls[0][0];
        expect(auditCall.action).toBe("UPDATE");
        expect(auditCall.changes.customHtmlChanged).toBe(true);
        expect(auditCall.changes.customHtmlLength).toBe("<p>x</p>".length);
        expect(auditCall.changes.strippedTags).toEqual(["script"]);
        expect(auditCall.changes.strippedAttrs).toEqual(["onerror"]);
    });

    it("rejects customHtml from a non-admin actor with 403", async () => {
        (getApiActor as jest.Mock).mockResolvedValue({
            userId: "coach-1",
            email: "coach@test.com",
            role: "COACH",
        });

        const res = await PATCH(patchReq({ customHtml: "<p>x</p>" }), routeParams("tpl-1"));

        expect(res.status).toBe(403);
        expect(sanitizeCustomHtml as jest.Mock).not.toHaveBeenCalled();
    });

    it("threads customHtml through the activation transaction path", async () => {
        mockExistingTemplate("SOLO_LANDING");
        (sanitizeCustomHtml as jest.Mock).mockReturnValue({
            sanitized: "<p>x</p>",
            didStripContent: false,
            strippedTags: [],
            strippedAttrs: [],
        });

        const res = await PATCH(
            patchReq({ isActive: true, customHtml: "<p>x</p>" }),
            routeParams("tpl-1"),
        );

        expect(res.status).toBe(200);
        expect(db.$transaction as jest.Mock).toHaveBeenCalled();
        const updateCalls = (db.pageTemplate.update as jest.Mock).mock.calls;
        const calledWithCustomHtml = updateCalls.some(
            (call) => call[0]?.data?.customHtml === "<p>x</p>",
        );
        expect(calledWithCustomHtml).toBe(true);
    });
});
