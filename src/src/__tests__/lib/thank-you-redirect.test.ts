/**
 * Unit Tests: resolveRegistrationSuccessUrl (BUG-MAY13-3 / Wave A Task A1)
 *
 * Tests the shared post-registration redirect URL helper used by both
 * free + paid registration flows. Mocks db.landingPage.findFirst to
 * simulate presence/absence of a published THANK_YOU LandingPage.
 */

// ---------------------------------------------------------------------------
// Mock db before any module imports — jest hoists jest.mock factories above
// imports, so we return jest.fn() stubs directly and grab typed refs after.
// ---------------------------------------------------------------------------
jest.mock("@/lib/db", () => ({
  db: {
    landingPage: {
      findFirst: jest.fn(),
    },
  },
}));

import { resolveRegistrationSuccessUrl } from "@/lib/workshops/thank-you-redirect";
import { db } from "@/lib/db";

const mockFindFirst = db.landingPage.findFirst as jest.Mock;

const APP_URL = "https://scaling-up-platform-v2.vercel.app";
const WORKSHOP_ID = "ws-abc-123";
const SLUG = "ws-2026-a1b2-thank-you";

describe("resolveRegistrationSuccessUrl (BUG-MAY13-3 Task A1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("free key + published THANK_YOU exists → returns ${appUrl}/workshop/<slug> with no query string", async () => {
    mockFindFirst.mockResolvedValue({ slug: SLUG });

    const url = await resolveRegistrationSuccessUrl({
      appUrl: APP_URL,
      workshopId: WORKSHOP_ID,
      key: { kind: "free", registrationId: "reg-free-1" },
    });

    expect(url).toBe(`${APP_URL}/workshop/${SLUG}`);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { workshopId: WORKSHOP_ID, template: "THANK_YOU", status: "PUBLISHED" },
      select: { slug: true },
    });
  });

  it("paid key + published THANK_YOU exists → returns ${appUrl}/workshop/<slug>?session_id={CHECKOUT_SESSION_ID}", async () => {
    mockFindFirst.mockResolvedValue({ slug: SLUG });

    const url = await resolveRegistrationSuccessUrl({
      appUrl: APP_URL,
      workshopId: WORKSHOP_ID,
      key: { kind: "paid", stripeSessionToken: "{CHECKOUT_SESSION_ID}" },
    });

    expect(url).toBe(`${APP_URL}/workshop/${SLUG}?session_id={CHECKOUT_SESSION_ID}`);
  });

  it("free key + NO published THANK_YOU → returns ${appUrl}/registration/success?id=<registrationId>", async () => {
    mockFindFirst.mockResolvedValue(null);

    const url = await resolveRegistrationSuccessUrl({
      appUrl: APP_URL,
      workshopId: WORKSHOP_ID,
      key: { kind: "free", registrationId: "reg-free-1" },
    });

    expect(url).toBe(`${APP_URL}/registration/success?id=reg-free-1`);
  });

  it("paid key + NO published THANK_YOU → returns ${appUrl}/registration/success?session_id={CHECKOUT_SESSION_ID}", async () => {
    mockFindFirst.mockResolvedValue(null);

    const url = await resolveRegistrationSuccessUrl({
      appUrl: APP_URL,
      workshopId: WORKSHOP_ID,
      key: { kind: "paid", stripeSessionToken: "{CHECKOUT_SESSION_ID}" },
    });

    expect(url).toBe(`${APP_URL}/registration/success?session_id={CHECKOUT_SESSION_ID}`);
  });
});
