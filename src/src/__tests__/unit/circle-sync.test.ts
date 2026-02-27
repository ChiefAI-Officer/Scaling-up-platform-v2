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

describe("syncCoachFromCircle", () => {
  const originalCircleApiKey = process.env.CIRCLE_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env.CIRCLE_API_KEY = originalCircleApiKey;
  });

  it("returns configuration error when Circle API key is missing", async () => {
    delete process.env.CIRCLE_API_KEY;

    const result = await syncCoachFromCircle("coach-1");

    expect(result.success).toBe(false);
    expect(result.updated).toBe(false);
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
      company: null,
      circleId: null,
    });
    (getCircleProfileByEmail as jest.Mock).mockResolvedValue(null);

    const result = await syncCoachFromCircle("coach-1");

    expect(result.success).toBe(false);
    expect(result.updated).toBe(false);
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
      company: null,
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
    expect(result.fieldsUpdated).toEqual(
      expect.arrayContaining(["profileImage", "bio", "company", "circleId"])
    );
    expect(db.coach.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "coach-1" },
        data: expect.objectContaining({
          profileImage: "https://cdn.example.com/avatar.jpg",
          bio: "Circle bio",
          company: "Scaling Up Coach",
          circleId: "circle-123",
          syncedAt: expect.any(Date),
        }),
      })
    );
  });

  it("does not overwrite non-empty profile fields unless forceOverwrite is true", async () => {
    process.env.CIRCLE_API_KEY = "test-key";
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      email: "coach@example.com",
      bio: "Existing bio",
      profileImage: "https://existing.example.com/photo.jpg",
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
    expect((db.coach.update as jest.Mock).mock.calls[0][0].data.company).toBeUndefined();

    (db.coach.update as jest.Mock).mockClear();

    const overwriteMode = await syncCoachFromCircle("coach-1", { forceOverwrite: true });
    expect(overwriteMode.success).toBe(true);
    expect(overwriteMode.fieldsUpdated).toEqual(
      expect.arrayContaining(["profileImage", "bio", "company", "circleId"])
    );
    expect(db.coach.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profileImage: "https://new.example.com/avatar.jpg",
          bio: "New bio",
          company: "New title",
          circleId: "circle-new",
          syncedAt: expect.any(Date),
        }),
      })
    );
  });
});
