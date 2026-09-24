jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

jest.mock("@/lib/assessments/access-control", () => ({
  canAccessOrganization: jest.fn(),
  asAccessDb: (value: unknown) => value,
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

jest.mock("@/lib/members/flags", () => ({
  isMemberLedTeamsEnabled: jest.fn(),
}));

jest.mock("@/lib/members/coach-led-teams", () => ({
  readCoachMemberLedTeams: jest.fn(),
  saveCoachMemberLedTeams: jest.fn(),
}));

jest.mock("@/lib/db", () => ({ db: {} }));

import { GET, PUT } from "@/app/api/organizations/[id]/respondents/[respondentId]/led-teams/route";
import { getApiActor } from "@/lib/auth/authorization";
import { canAccessOrganization } from "@/lib/assessments/access-control";
import { isMemberLedTeamsEnabled } from "@/lib/members/flags";
import {
  readCoachMemberLedTeams,
  saveCoachMemberLedTeams,
} from "@/lib/members/coach-led-teams";

const actor = {
  userId: "coach-user",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

const params = {
  params: Promise.resolve({ id: "org-1", respondentId: "member-1" }),
};

function request(method: "GET" | "PUT", body?: unknown) {
  return new Request(
    "http://localhost/api/organizations/org-1/respondents/member-1/led-teams",
    {
      method,
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
          }),
    },
  );
}

describe("member led-teams API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isMemberLedTeamsEnabled as jest.Mock).mockReturnValue(true);
    (getApiActor as jest.Mock).mockResolvedValue(actor);
    (canAccessOrganization as jest.Mock).mockResolvedValue(true);
  });

  it("is unavailable while the led-teams flag is off", async () => {
    (isMemberLedTeamsEnabled as jest.Mock).mockReturnValue(false);

    const response = await GET(request("GET") as never, params);

    expect(response.status).toBe(404);
    expect(readCoachMemberLedTeams).not.toHaveBeenCalled();
  });

  it("returns the member's assignments and resulting scope", async () => {
    (readCoachMemberLedTeams as jest.Mock).mockResolvedValue({
      respondentId: "member-1",
      organizationId: "org-1",
      assignments: [
        {
          teamId: "sales",
          teamName: "Sales",
          source: "backfill-0040",
          createdBy: "SYSTEM",
          createdAt: new Date("2026-09-23T00:00:00.000Z"),
        },
      ],
      scopeSize: 4,
    });

    const response = await GET(request("GET") as never, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(readCoachMemberLedTeams).toHaveBeenCalledWith(expect.anything(), {
      organizationId: "org-1",
      respondentId: "member-1",
    });
    expect(body.data.assignments[0]).toEqual(
      expect.objectContaining({ teamId: "sales", source: "backfill-0040" }),
    );
    expect(body.data.scopeSize).toBe(4);
  });

  it("replaces assignments and explicitly confirms only named inferred edges", async () => {
    (saveCoachMemberLedTeams as jest.Mock).mockResolvedValue({
      respondentId: "member-1",
      organizationId: "org-1",
      assignments: [
        { teamId: "sales", teamName: "Sales", source: "coach" },
        { teamId: "marketing", teamName: "Marketing", source: "coach" },
      ],
      scopeSize: 7,
    });

    const response = await PUT(
      request("PUT", {
        teamIds: ["sales", "marketing"],
        confirmTeamIds: ["sales"],
      }) as never,
      params,
    );

    expect(response.status).toBe(200);
    expect(saveCoachMemberLedTeams).toHaveBeenCalledWith(expect.anything(), {
      organizationId: "org-1",
      respondentId: "member-1",
      teamIds: ["sales", "marketing"],
      confirmTeamIds: ["sales"],
      actorId: "coach-user",
      performedBy: "coach@example.com",
    });
  });

  it("rejects malformed replacement bodies before writing", async () => {
    const response = await PUT(
      request("PUT", { teamIds: ["sales", "sales"], confirmTeamIds: ["foreign"] }) as never,
      params,
    );

    expect(response.status).toBe(400);
    expect(saveCoachMemberLedTeams).not.toHaveBeenCalled();
  });
});
