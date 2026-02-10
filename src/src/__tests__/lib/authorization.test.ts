import { ApiActor, canManageCoachData, isPrivilegedRole } from "@/lib/access-control";

function createActor(overrides: Partial<ApiActor> = {}): ApiActor {
  return {
    userId: "user-1",
    email: "user@example.com",
    role: "COACH",
    coachId: "coach-1",
    ...overrides,
  };
}

describe("authorization helpers", () => {
  describe("isPrivilegedRole", () => {
    it("returns true for ADMIN", () => {
      expect(isPrivilegedRole("ADMIN")).toBe(true);
    });

    it("returns true for STAFF", () => {
      expect(isPrivilegedRole("STAFF")).toBe(true);
    });

    it("returns false for COACH", () => {
      expect(isPrivilegedRole("COACH")).toBe(false);
    });
  });

  describe("canManageCoachData", () => {
    it("allows privileged users to manage any coach data", () => {
      const actor = createActor({ role: "ADMIN" });
      expect(canManageCoachData(actor, "coach-x")).toBe(true);
    });

    it("allows coach to manage own data", () => {
      const actor = createActor({ role: "COACH", coachId: "coach-1" });
      expect(canManageCoachData(actor, "coach-1")).toBe(true);
    });

    it("denies coach access to other coaches", () => {
      const actor = createActor({ role: "COACH", coachId: "coach-1" });
      expect(canManageCoachData(actor, "coach-2")).toBe(false);
    });
  });
});
