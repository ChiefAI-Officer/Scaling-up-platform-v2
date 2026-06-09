/**
 * TEMPLATE-02 render path — when LandingPage.customHtml is non-empty,
 * the stored DOMPurify-sanitized HTML renders via React's HTML-injection
 * prop and the React template switch is bypassed. Empty / null /
 * whitespace customHtml falls through to the existing switch.
 *
 * Task 5 adds a smoke test that uses the real interpolated Kajabi master-class
 * artifact as the customHtml payload so a regression in the render path for
 * a realistic payload is caught early.
 */
import * as fs from "fs";
import * as path from "path";
import { interpolateContentForHtml } from "@/lib/templates/interpolate-content-html";
import { sanitizeCustomHtml } from "@/lib/templates/sanitize-custom-html";

// Repo root is five levels up from src/src/__tests__/app/
const REPO_ROOT = path.join(__dirname, "..", "..", "..", "..");
const ARTIFACT_PATH = path.join(REPO_ROOT, "docs", "specs", "master-class-landing-kajabi.html");

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
    status: string;
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
      status: "PRE_EVENT",
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

describe("workshop slug pre-approval guard", () => {
  it("renders the 'not open yet' state instead of customHtml when workshop is AWAITING_APPROVAL (landing-page path)", async () => {
    (db.landingPage.findUnique as jest.Mock).mockResolvedValueOnce(
      landingFixture({
        customHtml: "<p>Custom hello</p>",
        workshop: { ...landingFixture().workshop, status: "AWAITING_APPROVAL" },
      })
    );

    const node = await LandingPageView(await Promise.resolve(makeProps("solo-slug")));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain("Registration isn&#x27;t open yet");
    expect(markup).not.toContain("data-custom-html-render");
    expect(markup).not.toContain("Custom hello");
  });

  it("renders the canceled state when workshop is CANCELED (landing-page path)", async () => {
    (db.landingPage.findUnique as jest.Mock).mockResolvedValueOnce(
      landingFixture({
        workshop: { ...landingFixture().workshop, status: "CANCELED" },
      })
    );

    const node = await LandingPageView(await Promise.resolve(makeProps("solo-slug")));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain("This workshop is no longer available.");
    expect(markup).not.toContain("solo:React title");
  });

  it("renders the React template when approved (PRE_EVENT, landing-page path)", async () => {
    (db.landingPage.findUnique as jest.Mock).mockResolvedValueOnce(
      landingFixture({
        workshop: { ...landingFixture().workshop, status: "PRE_EVENT" },
      })
    );

    const node = await LandingPageView(await Promise.resolve(makeProps("solo-slug")));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain("solo:React title");
  });

  it("renders the 'not open yet' state on the no-landing-page fallback path when not approved", async () => {
    (db.landingPage.findUnique as jest.Mock).mockResolvedValueOnce(null);
    (db.workshop.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "wks-1",
      title: "Pending Workshop",
      status: "REQUESTED",
      description: null,
      eventDate: new Date("2026-04-15T00:00:00Z"),
      eventTime: null,
      timezone: "America/New_York",
      format: "IN_PERSON",
      venueName: null,
      venueAddress: null,
      isFree: true,
      priceCents: null,
      earlyBirdPriceCents: null,
      coach: { firstName: "Jane", lastName: "Coach" },
    });

    const node = await LandingPageView(await Promise.resolve(makeProps("pending-slug")));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain("Registration isn&#x27;t open yet");
    // The default template + registration form must NOT render.
    expect(markup).not.toContain("Pending Workshop");
  });
});

// ── Task 5 — Render-path smoke: real interpolated artifact ────────────────────
describe("workshop slug customHtml render path — master-class artifact smoke", () => {
  it("renders data-custom-html-render wrapper with workshop title and Register anchor when artifact is the customHtml payload", async () => {
    // Build a realistic, fully-interpolated, sanitized artifact — mirroring
    // what runAutoBuild stores in LandingPage.customHtml at build time.
    const raw = fs.readFileSync(ARTIFACT_PATH, "utf8");
    const interpolated = interpolateContentForHtml(raw, {
      workshop_title: "Scaling Up Masterclass",
      workshop_description: "A full-day intensive for growth-focused leaders.",
      event_date: "Thursday, June 19, 2026",
      event_date_no_weekday: "June 19, 2026",
      event_time: "9:00 AM EDT",
      coach_name: "Alex Johnson",
      coach_title: "Scaling Up Certified Coach",
      coach_photo: "https://cdn.example.com/photos/alex.jpg",
      price: "$349",
      registration_url: "https://app.example.com/workshop/scaling-up-masterclass",
    });
    const { sanitized: storedHtml } = sanitizeCustomHtml(interpolated, { allowTokenUris: false });

    (db.landingPage.findUnique as jest.Mock).mockResolvedValueOnce(
      landingFixture({
        template: "SOLO_LANDING",
        customHtml: storedHtml,
        workshop: {
          ...landingFixture().workshop,
          status: "PRE_EVENT",
        },
      })
    );

    const node = await LandingPageView(await Promise.resolve(makeProps("scaling-up-masterclass")));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    // Must render the customHtml wrapper — NOT the React SOLO_LANDING template.
    expect(markup).toContain("data-custom-html-render");
    expect(markup).not.toContain("solo:React title");

    // Workshop title text must be present (interpolated into multiple locations).
    expect(markup).toContain("Scaling Up Masterclass");

    // The Register Here anchor must be present with the registration URL.
    expect(markup).toContain(">Register Here</a>");
    expect(markup).toContain("https://app.example.com/workshop/scaling-up-masterclass");
  });

  it("does NOT render the React SOLO_LANDING template when artifact customHtml is present", async () => {
    const raw = fs.readFileSync(ARTIFACT_PATH, "utf8");
    const interpolated = interpolateContentForHtml(raw, {
      workshop_title: "Exit Planning Workshop",
      workshop_description: "",
      event_date: "Friday, July 4, 2026",
      event_date_no_weekday: "July 4, 2026",
      event_time: "10:00 AM CDT",
      coach_name: "Sam Rivera",
      coach_title: "Scaling Up Certified Coach",
      coach_photo: "https://cdn.example.com/photos/sam.jpg",
      price: "$299",
      registration_url: "https://app.example.com/workshop/exit-planning",
    });
    const { sanitized: storedHtml } = sanitizeCustomHtml(interpolated, { allowTokenUris: false });

    (db.landingPage.findUnique as jest.Mock).mockResolvedValueOnce(
      landingFixture({
        template: "SOLO_LANDING",
        customHtml: storedHtml,
        content: JSON.stringify({ heroTitle: "React fallback title" }),
        workshop: {
          ...landingFixture().workshop,
          status: "PRE_EVENT",
        },
      })
    );

    const node = await LandingPageView(await Promise.resolve(makeProps("exit-planning")));
    const markup = renderToStaticMarkup(node as React.ReactElement);

    expect(markup).toContain("data-custom-html-render");
    // The React SoloLandingPageTemplate mock renders "solo:<heroTitle>".
    expect(markup).not.toContain("solo:React fallback title");
  });
});
