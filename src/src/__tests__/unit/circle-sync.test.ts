jest.mock("@/lib/db", () => ({
  db: {
    coach: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/services/circle", () => ({
  getCircleProfileByEmail: jest.fn(),
}));

import { db } from "@/lib/db";
import { getCircleProfileByEmail } from "@/services/circle";
import { syncCoachFromCircle } from "@/services/circle-sync";

const invalidImageWarning = {
  code: "invalid-image-url",
  field: "profileImage",
  message: "Profile image skipped because Circle supplied an invalid URL.",
} as const;

describe("syncCoachFromCircle", () => {
  const originalCircleApiKey = process.env.CIRCLE_API_KEY;
  let warnSpy: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.CIRCLE_API_KEY = "test-key";
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.CIRCLE_API_KEY = originalCircleApiKey;
  });

  it("returns configuration error when Circle API key is missing", async () => {
    delete process.env.CIRCLE_API_KEY;

    const result = await syncCoachFromCircle("coach-1");

    expect(result.success).toBe(false);
    expect(result.updated).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.error).toBe("Circle not configured");
    expect(db.coach.findUnique).not.toHaveBeenCalled();
  });

  it("returns not found when no Circle profile matches coach email", async () => {
    process.env.CIRCLE_API_KEY = "test-key";
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      email: "coach@example.com",
      bio: null,
      profileImage: null,
      title: null,
      company: "A Step Above",
      circleId: null,
    });
    (getCircleProfileByEmail as jest.Mock).mockResolvedValue(null);

    const result = await syncCoachFromCircle("coach-1");

    expect(result.success).toBe(false);
    expect(result.updated).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.error).toBe("No Circle profile found for this email");
    expect(db.coach.update).not.toHaveBeenCalled();
  });

  it("fills missing coach fields and persists sync metadata", async () => {
    process.env.CIRCLE_API_KEY = "test-key";
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      email: "coach@example.com",
      bio: null,
      profileImage: null,
      title: null,
      company: "A Step Above",
      circleId: null,
    });
    (getCircleProfileByEmail as jest.Mock).mockResolvedValue({
      memberId: "circle-123",
      bio: "Circle bio",
      avatarUrl: "https://cdn.example.com/avatar.jpg",
      title: "Scaling Up Coach",
    });

    const result = await syncCoachFromCircle("coach-1");

    expect(result.success).toBe(true);
    expect(result.updated).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.fieldsUpdated).toEqual(
      expect.arrayContaining(["profileImage", "bio", "title", "circleId"])
    );
    expect(db.coach.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "coach-1" },
        data: expect.objectContaining({
          profileImage: "https://cdn.example.com/avatar.jpg",
          bio: "Circle bio",
          title: "Scaling Up Coach",
          circleId: "circle-123",
          syncedAt: expect.any(Date),
        }),
      })
    );
    const updateData = (db.coach.update as jest.Mock).mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty("company");
    expect(result.fieldsUpdated).toContain("title");
    expect(result.fieldsUpdated).not.toContain("company");
  });

  it("does not overwrite non-empty profile fields unless forceOverwrite is true", async () => {
    process.env.CIRCLE_API_KEY = "test-key";
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      email: "coach@example.com",
      bio: "Existing bio",
      profileImage: "https://existing.example.com/photo.jpg",
      title: "Existing Title",
      company: "Existing company",
      circleId: "circle-old",
    });
    (getCircleProfileByEmail as jest.Mock).mockResolvedValue({
      memberId: "circle-new",
      bio: "New bio",
      avatarUrl: "https://new.example.com/avatar.jpg",
      title: "New title",
    });

    const defaultMode = await syncCoachFromCircle("coach-1");

    expect(defaultMode.success).toBe(true);
    expect(defaultMode.warnings).toEqual([]);
    expect(defaultMode.fieldsUpdated).toEqual(["circleId"]);
    expect(db.coach.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          circleId: "circle-new",
          syncedAt: expect.any(Date),
        }),
      })
    );
    expect((db.coach.update as jest.Mock).mock.calls[0][0].data.profileImage).toBeUndefined();
    expect((db.coach.update as jest.Mock).mock.calls[0][0].data.bio).toBeUndefined();
    expect((db.coach.update as jest.Mock).mock.calls[0][0].data.title).toBeUndefined();

    (db.coach.update as jest.Mock).mockClear();

    const overwriteMode = await syncCoachFromCircle("coach-1", { forceOverwrite: true });
    expect(overwriteMode.success).toBe(true);
    expect(overwriteMode.warnings).toEqual([]);
    expect(overwriteMode.fieldsUpdated).toEqual(
      expect.arrayContaining(["profileImage", "bio", "title", "circleId"])
    );
    expect(db.coach.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profileImage: "https://new.example.com/avatar.jpg",
          bio: "New bio",
          title: "New title",
          circleId: "circle-new",
          syncedAt: expect.any(Date),
        }),
      })
    );
    const updateData = (db.coach.update as jest.Mock).mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty("company");
    expect(overwriteMode.fieldsUpdated).toContain("title");
    expect(overwriteMode.fieldsUpdated).not.toContain("company");
  });

  it("returns Coach not found with no warnings", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await syncCoachFromCircle("coach-1");

    expect(result).toEqual({
      success: false,
      updated: false,
      fieldsUpdated: [],
      warnings: [],
      error: "Coach not found",
    });
    expect(getCircleProfileByEmail).not.toHaveBeenCalled();
    expect(db.coach.update).not.toHaveBeenCalled();
  });

  it("rejects an eligible non-https avatar but persists unrelated fields", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({ id: "coach-1", email: "coach@example.com", bio: null, profileImage: null, title: null, company: "A Step Above", circleId: null });
    (getCircleProfileByEmail as jest.Mock).mockResolvedValue({ memberId: "circle-123", bio: "Circle bio", avatarUrl: "http://cdn.example.com/private?token=SECRET", title: "Scaling Up Coach" });

    const result = await syncCoachFromCircle("coach-1");

    const updateCall = (db.coach.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.profileImage).toBeUndefined();
    expect(updateCall.data).toEqual(expect.objectContaining({ bio: "Circle bio", title: "Scaling Up Coach", circleId: "circle-123", syncedAt: expect.any(Date) }));
    expect(updateCall.data).not.toHaveProperty("company");
    expect(result).toEqual({ success: true, updated: true, fieldsUpdated: ["bio", "title", "circleId"], warnings: [invalidImageWarning] });
    expect(warnSpy).toHaveBeenCalledWith("[Circle Sync] Field skipped", { coachId: "coach-1", syncMode: "fill-empty", field: "profileImage", reason: "invalid-image-url" });
    expect(warnSpy.mock.invocationCallOrder[0]).toBeGreaterThan((db.coach.update as jest.Mock).mock.invocationCallOrder[0]);
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("coach@example.com");
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("SECRET");
  });

  it("forceOverwrite preserves an existing image when the Circle avatar is invalid", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({ id: "coach-1", email: "coach@example.com", bio: "Existing bio", profileImage: "https://existing.example.com/photo.jpg", title: "Existing Title", company: "Existing company", circleId: "circle-old" });
    (getCircleProfileByEmail as jest.Mock).mockResolvedValue({ memberId: "circle-new", bio: "New bio", avatarUrl: "javascript:alert(1)", title: "New title" });

    const result = await syncCoachFromCircle("coach-1", { forceOverwrite: true });

    const updateCall = (db.coach.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.profileImage).toBeUndefined();
    expect(updateCall.data).toEqual(expect.objectContaining({ bio: "New bio", title: "New title", circleId: "circle-new", syncedAt: expect.any(Date) }));
    expect(updateCall.data).not.toHaveProperty("company");
    expect(result.fieldsUpdated).toEqual(["bio", "title", "circleId"]);
    expect(result.warnings).toEqual([invalidImageWarning]);
    expect(warnSpy).toHaveBeenCalledWith("[Circle Sync] Field skipped", { coachId: "coach-1", syncMode: "force-overwrite", field: "profileImage", reason: "invalid-image-url" });
  });

  it("does not validate or warn about an ineligible avatar in fill-empty mode", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({ id: "coach-1", email: "coach@example.com", bio: "Existing bio", profileImage: "https://existing.example.com/photo.jpg", title: "Existing Title", company: "Existing company", circleId: "circle-123" });
    (getCircleProfileByEmail as jest.Mock).mockResolvedValue({ memberId: "circle-123", bio: "Ignored bio", avatarUrl: "http://ignored.example.com/avatar.jpg", title: "Ignored title" });

    const result = await syncCoachFromCircle("coach-1");

    expect((db.coach.update as jest.Mock).mock.calls[0][0].data).toEqual({ syncedAt: expect.any(Date) });
    expect(result).toEqual({ success: true, updated: false, fieldsUpdated: [], warnings: [] });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns success updated=false when only an eligible invalid avatar is skipped", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({ id: "coach-1", email: "coach@example.com", bio: "Existing bio", profileImage: null, title: "Existing Title", company: "Existing company", circleId: "circle-123" });
    (getCircleProfileByEmail as jest.Mock).mockResolvedValue({ memberId: "circle-123", avatarUrl: "https://" });

    const result = await syncCoachFromCircle("coach-1");

    expect((db.coach.update as jest.Mock).mock.calls[0][0].data).toEqual({ syncedAt: expect.any(Date) });
    expect(result).toEqual({ success: true, updated: false, fieldsUpdated: [], warnings: [invalidImageWarning] });
  });

  it("emits no field-skipped warning when persistence fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    (db.coach.findUnique as jest.Mock).mockResolvedValue({ id: "coach-1", email: "coach@example.com", bio: null, profileImage: null, title: null, company: "A Step Above", circleId: null });
    (getCircleProfileByEmail as jest.Mock).mockResolvedValue({ avatarUrl: "http://cdn.example.com/avatar.jpg" });
    (db.coach.update as jest.Mock).mockRejectedValue(new Error("database unavailable"));

    const result = await syncCoachFromCircle("coach-1");

    expect(warnSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, updated: false, fieldsUpdated: [], warnings: [], error: "database unavailable" });
  });

  it("emits one warning for every repeated eligible sync attempt", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({ id: "coach-1", email: "coach@example.com", bio: "Existing bio", profileImage: null, title: "Existing Title", company: "Existing company", circleId: "circle-123" });
    (getCircleProfileByEmail as jest.Mock).mockResolvedValue({ memberId: "circle-123", avatarUrl: "data:image/png;base64,abc" });

    await syncCoachFromCircle("coach-1");
    await syncCoachFromCircle("coach-1");

    expect(db.coach.update).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
