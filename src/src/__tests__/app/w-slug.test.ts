/**
 * Tests for /w/[slug]/page.tsx — short URL redirect logic.
 */

jest.mock("@/lib/db", () => ({
  db: {
    landingPage: { findUnique: jest.fn() },
  },
}));

// redirect() and notFound() throw in Next.js to halt execution — simulate that here
jest.mock("next/navigation", () => ({
  redirect: jest.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${url}` });
  }),
  notFound: jest.fn().mockImplementation(() => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
  }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => ({ get: jest.fn() }),
  usePathname: () => "/",
}));

// Avoid rendering the full React tree for landing page renderer
jest.mock("@/components/templates/landing-page-renderer", () => ({
  LandingPageRenderer: () => null,
}));

import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import LandingPageComponent from "@/app/(public)/w/[slug]/page";

const mockDb = db as jest.Mocked<typeof db>;
const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;
const mockNotFound = notFound as jest.MockedFunction<typeof notFound>;

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("/w/[slug] page", () => {
  it("redirects to /workshop/[slug] when landing page is PUBLISHED", async () => {
    (mockDb.landingPage.findUnique as jest.Mock).mockResolvedValue({
      slug: "my-workshop",
      status: "PUBLISHED",
    });

    // redirect() throws in Next.js runtime — catch it here
    await expect(LandingPageComponent(makeParams("my-workshop"))).rejects.toMatchObject({
      message: "NEXT_REDIRECT",
    });
    expect(mockRedirect).toHaveBeenCalledWith("/workshop/my-workshop");
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("does not redirect when landing page status is DRAFT", async () => {
    (mockDb.landingPage.findUnique as jest.Mock).mockResolvedValue({
      slug: "draft-workshop",
      status: "DRAFT",
    });

    // DRAFT falls through to notFound() — swallow the notFound throw
    await expect(LandingPageComponent(makeParams("draft-workshop"))).rejects.toMatchObject({
      message: "NEXT_NOT_FOUND",
    });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("calls notFound when slug is unknown and not in mock data", async () => {
    (mockDb.landingPage.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(LandingPageComponent(makeParams("totally-unknown-slug"))).rejects.toMatchObject({
      message: "NEXT_NOT_FOUND",
    });
    expect(mockNotFound).toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("serves mock renderer without redirect for known demo slugs", async () => {
    (mockDb.landingPage.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await LandingPageComponent(makeParams("rob-williams-solo"));

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
  });
});
