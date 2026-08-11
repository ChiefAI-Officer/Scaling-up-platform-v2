jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest extends Request {
    nextUrl: URL;

    constructor(input: string | URL | Request, init?: RequestInit) {
      super(input, init);
      this.nextUrl = new URL(typeof input === "string" ? input : input.toString());
    }
  },
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));
jest.mock("@/lib/db", () => ({
  db: { coach: { findMany: jest.fn() } },
}));
jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

import { GET } from "@/app/api/bio/profiles/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

it("prefers title and retains a read-only company fallback", async () => {
  (getApiActor as jest.Mock).mockResolvedValue({
    userId: "admin-1",
    role: "ADMIN",
    email: "admin@example.com",
  });
  (db.coach.findMany as jest.Mock).mockResolvedValue([
    {
      id: "coach-1",
      firstName: "Lynne",
      lastName: "Verdun",
      title: "Master Coach",
      company: "A Step Above",
      profileImage: null,
      createdAt: new Date("2026-08-11T00:00:00.000Z"),
    },
    {
      id: "coach-2",
      firstName: "Legacy",
      lastName: "Coach",
      title: null,
      company: "Legacy Company Value",
      profileImage: null,
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
    },
  ]);

  const request = new Request("http://localhost/api/bio/profiles") as Request & {
    nextUrl: URL;
  };
  request.nextUrl = new URL(request.url);
  const response = await GET(request as Parameters<typeof GET>[0]);
  const body = await response.json();

  expect(body.data[0]).toEqual(expect.objectContaining({
    title: "Master Coach",
    company: "A Step Above",
  }));
  expect(body.data[1]).toEqual(expect.objectContaining({
    title: "Legacy Company Value",
    company: "Legacy Company Value",
  }));
});
