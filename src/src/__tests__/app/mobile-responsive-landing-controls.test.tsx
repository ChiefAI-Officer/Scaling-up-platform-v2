import { cleanup, render, screen } from "@testing-library/react";

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "workshop-1" }),
  useRouter: () => ({ push }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));
jest.mock("@/components/templates/bio-page-template", () => ({
  BioPageTemplate: () => <output>Bio preview</output>,
}));

import BioPageEditor from "@/app/(dashboard)/workshops/[id]/landing-pages/bio-page/page";
import WorkshopEditorPage from "@/app/(dashboard)/workshops/[id]/landing-pages/page";

const workshop = {
  id: "workshop-1",
  title: "Leadership Intensive",
  workshopCode: "LI-1",
  coach: {
    id: "coach-1",
    firstName: "Jordan",
    lastName: "Lee",
    bio: "Coach bio",
    profileImage: "https://example.test/coach.png",
    title: "Coach",
    company: "Scaling Up",
    bookCallUrl: null,
  },
  landingPages: [
    { id: "page-1", template: "SOLO_LANDING", status: "PUBLISHED", slug: "leadership" },
  ],
};

afterEach(() => {
  cleanup();
  delete document.body.dataset.mobileResponsive;
});

it("keeps the bio profile-image inputs within a 320px mobile editor", async () => {
  document.body.dataset.mobileResponsive = "on";
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = input.toString();
    return Promise.resolve({
      ok: true,
      json: async () => url.endsWith("/BIO_PAGE")
        ? { success: true, data: null }
        : { success: true, data: workshop },
    });
  }) as unknown as typeof fetch;

  const { container } = render(<BioPageEditor />);

  const imageUrl = await screen.findByPlaceholderText("Image URL");
  const fileInput = container.querySelector('input[type="file"]');
  expect(imageUrl.parentElement?.parentElement).toHaveClass("flex-col", "sm:flex-row");
  expect(imageUrl.parentElement).toHaveClass("min-w-0");
  expect(fileInput).toHaveClass("min-w-0", "max-w-full");
});

it("stacks preview and copy controls with 44px targets on mobile", async () => {
  document.body.dataset.mobileResponsive = "on";
  global.fetch = jest.fn(() => Promise.resolve({
    ok: true,
    json: async () => ({ success: true, data: workshop }),
  })) as unknown as typeof fetch;

  render(<WorkshopEditorPage />);

  const preview = await screen.findByRole("button", { name: "Preview" });
  const copy = screen.getAllByRole("button", { name: "Copy from..." })[0];
  expect(preview.parentElement).toHaveClass("flex-col", "sm:flex-row");
  expect(preview).toHaveClass("min-h-11");
  expect(copy).toHaveClass("min-h-11");
});
