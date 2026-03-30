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

jest.mock("@/lib/authorization", () => ({
    getApiActor: jest.fn(),
    isPrivilegedRole: (r: string) => r === "ADMIN" || r === "STAFF",
}));

jest.mock("@/lib/audit", () => ({
    logAudit: jest.fn(),
}));

import { PATCH } from "@/app/api/page-templates/[id]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/authorization";

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
