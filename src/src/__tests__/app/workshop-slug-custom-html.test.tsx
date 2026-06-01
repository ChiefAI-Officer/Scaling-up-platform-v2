/**
 * TEMPLATE-02 render path — when LandingPage.customHtml is non-empty,
 * the stored DOMPurify-sanitized HTML renders via React's HTML-injection
 * prop and the React template switch is bypassed. Empty / null /
 * whitespace customHtml falls through to the existing switch.
 */

jest.mock("@/lib/db", () => ({
  db: {
    landingPage: { findUnique: jest.fn() },
    workshop: { findUnique: jest.fn() },
  },
}));

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

jest.mock("@/components/templates/thank-you-page-template", () => ({
  ThankYouPageTemplate: () => null,
}));
jest.mock("@/components/templates/registration-page-template", () => ({
  RegistrationPageTemplate: () => null,
}));
jest.mock("@/components/templates/bio-page-template", () => ({
  BioPageTemplate: () => null,
}));
jest.mock("@/components/templates/solo-landing-page-template", () => ({
  SoloLandingPageTemplate: ({ content }: { content: { heroTitle?: string } }) => `solo:${content?.heroTitle ?? ""}`,
}));
jest.mock("@/components/templates/duo-landing-page-template", () => ({
  DuoLandingPageTemplate: () => null,
}));
jest.mock("@/lib/templates/resolve-custom-code-renderer", () => ({
  resolveCustomCodeRenderer: jest.fn().mockResolvedValue(null),
}));

import { db } from "@/lib/db";
import LandingPageView from "@/app/(public)/workshop/[slug]/page";
import { renderToStaticMarkup } from "react-dom/server";

type FoundLanding = {
  template: string;
  content: string;
  customHtml: string | null;
  customCode: string | null;
  status: string;
  workshop: {
    id: string;
    format: string;
    venueName: string | null;
    venueAddress: string | null;
    isFree: boolean;
    coach: Record<string, unknown>;
    workshopType: Record<string, unknown> | null;
  };
};

function makeProps(slug: string) {
  return {
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({}),
  };
}

function landingFixture(overrides: Partial<FoundLanding> = {}): FoundLanding {
  return {
    template: "SOLO_LANDING",
    content: JSON.stringify({ heroTitle: "React title" }),
    customHtml: null,
    customCode: null,
    status: "PUBLISHED",
    workshop: {
      id: "wks-1",
      format: "VIRTUAL",
      venueName: null,
      venueAddress: null,
      isFree: false,
      coach: {},
      workshopType: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("workshop slug customHtml render path", () => {
  it("renders the customHtml override when non-empty", async () => {
    (db.landingPage.findUnique as jest.Mock).mockResolvedValueOnce(
      landingFixture({ customHtml: "<p>Custom hello {{workshop_title}}</p>" })
    );

    const node = await LandingPageView(await Promise.resolve(makeProps("solo-slug")));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain("data-custom-html-render");
    expect(markup).toContain("<p>Custom hello {{workshop_title}}</p>");
    expect(markup).not.toContain("solo:React title");
  });

  it("falls through to React template when customHtml is null", async () => {
    (db.landingPage.findUnique as jest.Mock).mockResolvedValueOnce(
      landingFixture({ customHtml: null })
    );

    const node = await LandingPageView(await Promise.resolve(makeProps("solo-slug")));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).not.toContain("data-custom-html-render");
    expect(markup).toContain("solo:React title");
  });

  it("falls through to React template when customHtml is empty string", async () => {
    (db.landingPage.findUnique as jest.Mock).mockResolvedValueOnce(
      landingFixture({ customHtml: "" })
    );

    const node = await LandingPageView(await Promise.resolve(makeProps("solo-slug")));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).not.toContain("data-custom-html-render");
    expect(markup).toContain("solo:React title");
  });

  it("falls through to React template when customHtml is whitespace-only", async () => {
    (db.landingPage.findUnique as jest.Mock).mockResolvedValueOnce(
      landingFixture({ customHtml: "   \n\t  " })
    );

    const node = await LandingPageView(await Promise.resolve(makeProps("solo-slug")));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).not.toContain("data-custom-html-render");
    expect(markup).toContain("solo:React title");
  });

  it("does not parse content JSON when customHtml takes over", async () => {
    (db.landingPage.findUnique as jest.Mock).mockResolvedValueOnce(
      landingFixture({
        customHtml: "<p>Hi</p>",
        content: "not valid json {{{",
      })
    );

    const node = await LandingPageView(await Promise.resolve(makeProps("solo-slug")));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain("data-custom-html-render");
    expect(markup).toContain("<p>Hi</p>");
  });
});
