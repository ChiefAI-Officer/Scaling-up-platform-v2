jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

import { getApiActor } from "@/lib/auth/authorization";
import {
  requireAdminApiActor,
  requirePrivilegedApiActor,
} from "@/lib/auth/api-actor-gate";

const ADMIN = { userId: "u1", email: "a@x.com", role: "ADMIN" as const, coachId: null };
const STAFF = { userId: "u2", email: "s@x.com", role: "STAFF" as const, coachId: null };
const COACH = { userId: "u3", email: "c@x.com", role: "COACH" as const, coachId: "coach-1" };

describe("requireAdminApiActor (ADMIN-only, mirrors the workflows/survey-templates parent gate)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when there is no authenticated actor", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    expect(await requireAdminApiActor()).toEqual({ ok: false, status: 401 });
  });

  it("returns 403 for a COACH", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(COACH);
    expect(await requireAdminApiActor()).toEqual({ ok: false, status: 403 });
  });

  it("returns 403 for STAFF — admin-only, does NOT widen to privileged", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(STAFF);
    expect(await requireAdminApiActor()).toEqual({ ok: false, status: 403 });
  });

  it("returns ok + actor for ADMIN", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN);
    expect(await requireAdminApiActor()).toEqual({ ok: true, actor: ADMIN });
  });
});

describe("requirePrivilegedApiActor (ADMIN or STAFF — for the files list)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when there is no authenticated actor", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    expect(await requirePrivilegedApiActor()).toEqual({ ok: false, status: 401 });
  });

  it("returns 403 for a COACH", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(COACH);
    expect(await requirePrivilegedApiActor()).toEqual({ ok: false, status: 403 });
  });

  it("allows STAFF", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(STAFF);
    expect(await requirePrivilegedApiActor()).toEqual({ ok: true, actor: STAFF });
  });

  it("allows ADMIN", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN);
    expect(await requirePrivilegedApiActor()).toEqual({ ok: true, actor: ADMIN });
  });
});
