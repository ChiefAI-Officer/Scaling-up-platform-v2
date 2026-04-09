jest.mock("@/lib/auth/authorization", () => ({
  requireCoach: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  db: {
    registration: {
      findMany: jest.fn(),
    },
  },
}));

// The page imports animated components — stub them out
jest.mock("@/components/ui/animated", () => ({
  FadeUp: ({ children }: { children: unknown }) => children,
}));

// Stub the client component — we only care about the DB query
jest.mock(
  "@/app/(portal)/portal/registrations/registrations-client",
  () => ({
    RegistrationsClient: () => null,
  })
);

import RegistrationsPage from "@/app/(portal)/portal/registrations/page";
import { requireCoach } from "@/lib/auth/authorization";
import { db } from "@/lib/db";

describe("Portal registrations page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireCoach as jest.Mock).mockResolvedValue({
      coach: { id: "coach-1" },
    });
    (db.registration.findMany as jest.Mock).mockResolvedValue([]);
  });

  it("excludes PENDING registrations from the coach registrations list", async () => {
    await RegistrationsPage();

    const call = (db.registration.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual(
      expect.objectContaining({
        paymentStatus: { not: "PENDING" },
      })
    );
  });

  it("still queries by the coach's workshops", async () => {
    await RegistrationsPage();

    const call = (db.registration.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual(
      expect.objectContaining({
        workshop: { coachId: "coach-1" },
      })
    );
  });
});
