import { canReadFile } from "@/lib/files/file-access";

// canReadFile mirrors the canonical file-READ policy in
// app/api/files/[id]/download/route.ts: ADMIN/STAFF allowed; a COACH who owns
// the workshop is gated by the attachment-status policy; uploader fallback for
// workshop-less files. Uses the REAL canRoleAccessAttachment (pure, status-driven).

const baseFile = (over: Partial<{ uploadedBy: string; workshop: { coachId: string | null; status: string | null } | null }> = {}) => ({
  uploadedBy: "uploader-user",
  workshop: { coachId: "coach-1", status: "PRE_EVENT" } as { coachId: string | null; status: string | null } | null,
  ...over,
});

const ADMIN = { role: "ADMIN" as const, userId: "admin-user", coachId: null };
const STAFF = { role: "STAFF" as const, userId: "staff-user", coachId: null };
const OWNER_COACH = { role: "COACH" as const, userId: "coach-user", coachId: "coach-1" };
const OTHER_COACH = { role: "COACH" as const, userId: "other-user", coachId: "coach-2" };

describe("canReadFile", () => {
  it("allows ADMIN regardless of workshop", () => {
    expect(canReadFile({ actor: ADMIN, file: baseFile() })).toBe(true);
  });

  it("allows STAFF regardless of workshop", () => {
    expect(canReadFile({ actor: STAFF, file: baseFile() })).toBe(true);
  });

  it("allows the owning coach when the workshop status passes the attachment gate (PRE_EVENT)", () => {
    expect(canReadFile({ actor: OWNER_COACH, file: baseFile({ workshop: { coachId: "coach-1", status: "PRE_EVENT" } }) })).toBe(true);
  });

  it("denies the owning coach when the workshop status fails the attachment gate (REQUESTED)", () => {
    expect(canReadFile({ actor: OWNER_COACH, file: baseFile({ workshop: { coachId: "coach-1", status: "REQUESTED" } }) })).toBe(false);
  });

  it("denies a coach who does not own the workshop", () => {
    expect(canReadFile({ actor: OTHER_COACH, file: baseFile({ workshop: { coachId: "coach-1", status: "PRE_EVENT" } }) })).toBe(false);
  });

  it("allows the uploader for a workshop-less file (uploader fallback)", () => {
    expect(canReadFile({ actor: { role: "COACH", userId: "uploader-user", coachId: "coach-9" }, file: baseFile({ workshop: null }) })).toBe(true);
  });

  it("denies a coach who is neither owner nor uploader on a workshop-less file", () => {
    expect(canReadFile({ actor: OTHER_COACH, file: baseFile({ uploadedBy: "someone-else", workshop: null }) })).toBe(false);
  });
});
