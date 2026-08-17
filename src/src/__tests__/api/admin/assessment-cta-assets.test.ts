jest.mock("@vercel/blob", () => ({ put: jest.fn() }));
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200 }),
  },
}));
jest.mock("@/lib/db", () => ({ db: { assessmentTemplate: { findUnique: jest.fn() } } }));
jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { put } from "@vercel/blob";
import { POST } from "@/app/api/admin/assessment-cta-assets/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

function uploadRequest(file: File): { formData: () => Promise<FormData> } {
  const body = new FormData();
  body.set("templateId", "tpl-1");
  body.set("file", file);
  return { formData: async () => body };
}

describe("POST assessment CTA asset", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WAVE_PUBLIC_MARKETING_CTA_ENABLED = "1";
  });

  it("requires admin/staff and an existing template", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    expect((await POST(uploadRequest(new File(["x"], "a.png", { type: "image/png" })) as never)).status).toBe(401);

    (getApiActor as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue(null);
    expect((await POST(uploadRequest(new File(["x"], "a.png", { type: "image/png" })) as never)).status).toBe(404);
  });

  it("rejects non-images", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({ id: "tpl-1" });
    const res = await POST(uploadRequest(new File(["bad"], "a.txt", { type: "text/plain" })) as never);
    expect(res.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it("stores an approved image under the template namespace", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ role: "STAFF" });
    (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({ id: "tpl-1" });
    (put as jest.Mock).mockResolvedValue({ url: "https://blob.example/books.png", pathname: "assessment-cta/tpl-1/books.png" });

    const res = await POST(uploadRequest(new File(["png"], "books.png", { type: "image/png" })) as never);

    expect(res.status).toBe(201);
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^assessment-cta\/tpl-1\//),
      expect.any(File),
      expect.objectContaining({ access: "public" }),
    );
    expect(await res.json()).toMatchObject({ url: "https://blob.example/books.png" });
  });
});
