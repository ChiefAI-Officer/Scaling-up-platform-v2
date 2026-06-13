/**
 * TDD Tests for buildEnrichedLandingPageVariables()
 *
 * Verifies BEHAVIOR: returned record includes all base variables
 * PLUS registration_url and registrationUrl resolved from the workshop's
 * REGISTRATION LandingPage slug — or empty-string fallback when none exists.
 */

// --- Mocks (hoisted before imports) ---

jest.mock("@/lib/db", () => ({
  db: {
    landingPage: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/templates/template-interpolation", () => ({
  buildWorkshopVariables: jest.fn(),
}));

import { db } from "@/lib/db";
import { buildWorkshopVariables } from "@/lib/templates/template-interpolation";
import { buildEnrichedLandingPageVariables } from "@/lib/templates/landing-page-variables";

const mockDb = db as jest.Mocked<typeof db>;
const mockBuildWorkshopVariables = buildWorkshopVariables as jest.MockedFunction<
  typeof buildWorkshopVariables
>;

const BASE_VARIABLES: Record<string, string> = {
  workshop_title: "Scaling Up Workshop",
  coach_name: "Jane Smith",
  event_date: "June 15, 2026",
};

describe("buildEnrichedLandingPageVariables", () => {
  const WORKSHOP_ID = "ws-abc-123";

  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildWorkshopVariables.mockResolvedValue({ ...BASE_VARIABLES });
  });

  describe("when a REGISTRATION LandingPage exists", () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockDb.landingPage.findUnique as jest.Mock).mockResolvedValue({
        slug: "ws-2026-ab12-registration",
      });
    });

    it("returns all base variables from buildWorkshopVariables", async () => {
      process.env.APP_URL = "https://example.com";
      const result = await buildEnrichedLandingPageVariables(WORKSHOP_ID);

      expect(result).toMatchObject(BASE_VARIABLES);
    });

    it("resolves registration_url to absolute URL using APP_URL + slug", async () => {
      process.env.APP_URL = "https://example.com";
      const result = await buildEnrichedLandingPageVariables(WORKSHOP_ID);

      expect(result.registration_url).toBe(
        "https://example.com/workshop/ws-2026-ab12-registration"
      );
    });

    it("resolves registrationUrl camelCase alias to same absolute URL", async () => {
      process.env.APP_URL = "https://example.com";
      const result = await buildEnrichedLandingPageVariables(WORKSHOP_ID);

      expect(result.registrationUrl).toBe(
        "https://example.com/workshop/ws-2026-ab12-registration"
      );
    });

    it("queries LandingPage using workshopId_template composite key with REGISTRATION", async () => {
      process.env.APP_URL = "https://example.com";
      await buildEnrichedLandingPageVariables(WORKSHOP_ID);

      expect(mockDb.landingPage.findUnique).toHaveBeenCalledWith({
        where: {
          workshopId_template: {
            workshopId: WORKSHOP_ID,
            template: "REGISTRATION",
          },
        },
        select: { slug: true },
      });
    });

    it("uses a trailing-free APP_URL — no double-slash in URL", async () => {
      process.env.APP_URL = "https://example.com/";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockDb.landingPage.findUnique as jest.Mock).mockResolvedValue({
        slug: "some-slug",
      });
      const result = await buildEnrichedLandingPageVariables(WORKSHOP_ID);
      // Should match exactly what auto-build-service produces — template literal, no trim
      expect(result.registration_url).toBe(
        "https://example.com//workshop/some-slug"
      );
    });
  });

  describe("when NO REGISTRATION LandingPage exists", () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockDb.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
    });

    it("returns registration_url as empty string", async () => {
      process.env.APP_URL = "https://example.com";
      const result = await buildEnrichedLandingPageVariables(WORKSHOP_ID);

      expect(result.registration_url).toBe("");
    });

    it("returns registrationUrl camelCase alias as empty string", async () => {
      process.env.APP_URL = "https://example.com";
      const result = await buildEnrichedLandingPageVariables(WORKSHOP_ID);

      expect(result.registrationUrl).toBe("");
    });

    it("still returns all base variables from buildWorkshopVariables", async () => {
      process.env.APP_URL = "https://example.com";
      const result = await buildEnrichedLandingPageVariables(WORKSHOP_ID);

      expect(result).toMatchObject(BASE_VARIABLES);
    });
  });

  describe("when buildWorkshopVariables returns null (workshop not found)", () => {
    beforeEach(() => {
      mockBuildWorkshopVariables.mockResolvedValue(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockDb.landingPage.findUnique as jest.Mock).mockResolvedValue(null);
    });

    it("returns null", async () => {
      const result = await buildEnrichedLandingPageVariables(WORKSHOP_ID);

      expect(result).toBeNull();
    });
  });
});
