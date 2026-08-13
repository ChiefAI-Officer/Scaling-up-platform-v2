import { cleanup, render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "workshop-1" }),
  useSearchParams: () => ({ get: () => null }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));
jest.mock("@/components/templates/duo-landing-page-template", () => ({
  DuoLandingPageTemplate: ({ content }: { content: { coach1: { title: string }; coach2: { title: string } } }) => (
    <output data-testid="duo-preview">{content.coach1.title}|{content.coach2.title}</output>
  ),
  SAMPLE_WORKSHOP_DUO: {},
}));
jest.mock("@/components/workshops/custom-html-panel", () => ({
  CustomHtmlPanel: () => null,
}));

import DuoLandingEditor from "@/app/(dashboard)/workshops/[id]/landing-pages/duo-landing/page";

const savedCoach1 = {
  name: "Saved Primary",
  photo: "https://example.com/saved-primary.png",
  title: "Legacy Primary Company Title",
};
const savedCoach2 = {
  name: "Saved Secondary",
  photo: "https://example.com/saved-secondary.png",
  title: "Legacy Secondary Company Title",
};

let landingPageContent: Record<string, unknown>;

beforeEach(() => {
  delete document.body.dataset.mobileResponsive;
  landingPageContent = {
    coach1BioId: "coach-1",
    coach2BioId: "coach-2",
    coach1: savedCoach1,
    coach2: savedCoach2,
  };
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === "/api/workshops/workshop-1") {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            eventDate: "2026-08-11T00:00:00.000Z",
            eventTime: "11am - 12pm",
            timezone: "America/New_York",
            coach: {
              id: "coach-1",
              firstName: "Current",
              lastName: "Primary",
              profileImage: null,
              title: "Current Primary Professional Title",
              company: "Current Primary Company",
            },
            tasks: [],
          },
        }),
      });
    }
    if (url === "/api/workshops/workshop-1/landing-pages/DUO_LANDING") {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            content: JSON.stringify(landingPageContent),
          },
        }),
      });
    }
    if (url === "/api/bio/profiles") {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              id: "coach-1",
              name: "Current Primary",
              title: "Current Primary Professional Title",
              company: "Current Primary Company",
              photoUrl: "",
              createdAt: "2026-08-11T00:00:00.000Z",
              editUrl: "/bio/coach-1",
            },
            {
              id: "coach-2",
              name: "Current Secondary",
              title: "Current Secondary Professional Title",
              company: "Current Secondary Company",
              photoUrl: "",
              createdAt: "2026-08-11T00:00:00.000Z",
              editUrl: "/bio/coach-2",
            },
          ],
        }),
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  delete document.body.dataset.mobileResponsive;
});

it("keeps saved coach snapshots when current BIO profiles have newer titles", async () => {
  render(<DuoLandingEditor />);

  expect(await screen.findByTestId("duo-preview")).toHaveTextContent(
    "Legacy Primary Company Title|Legacy Secondary Company Title",
  );
});

it("uses current BIO profiles when a new landing page has no saved coach snapshots", async () => {
  landingPageContent = {};

  render(<DuoLandingEditor />);

  expect(await screen.findByTestId("duo-preview")).toHaveTextContent(
    "Current Primary Professional Title|Scaling Up Certified Coach",
  );
});

it("stacks repeated-field controls and exposes 44px targets on mobile", async () => {
  document.body.dataset.mobileResponsive = "on";

  render(<DuoLandingEditor />);

  await screen.findByTestId("duo-preview");
  const removeButton = screen.getAllByRole("button", { name: "×" })[0];
  expect(removeButton.parentElement).toHaveClass("flex-col", "sm:flex-row");
  expect(removeButton).toHaveClass("min-h-11", "min-w-11");
  expect(screen.getAllByRole("button", { name: "+ Add" })[0]).toHaveClass("min-h-11");
});
