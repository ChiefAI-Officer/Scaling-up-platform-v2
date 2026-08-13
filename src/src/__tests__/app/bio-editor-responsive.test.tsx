import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "coach-1" }),
}));

import CoachBioEditorPage from "@/app/(dashboard)/bio/[id]/page";
import { BioResponsiveProvider } from "@/app/(dashboard)/bio/[id]/bio-responsive-context";

const coach = {
  id: "coach-1",
  email: "a-very-long-coach-email-address@example.com",
  firstName: "Lynne",
  lastName: "Verdun",
  title: "Master Coach",
  company: "A Step Above",
  bio: "A complete coach biography.",
  profileImage: null,
  circleId: "circle-1",
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: coach }),
  });
});

it("keeps the existing bio editor presentation by default", async () => {
  render(<CoachBioEditorPage />);

  expect(await screen.findByRole("heading", { name: "Bio Page Editor" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View Coach Record" })).not.toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Save Bio" })).not.toHaveClass("min-h-11");
});

it("contains long bio fields and stacks 44px actions when enabled", async () => {
  render(
    <BioResponsiveProvider enabled>
      <CoachBioEditorPage />
    </BioResponsiveProvider>,
  );

  const heading = await screen.findByRole("heading", { name: "Bio Page Editor" });
  expect(heading.closest("[data-responsive-page-header]")).toBeInTheDocument();
  expect(screen.getByLabelText("Email")).toHaveClass("min-w-0 min-h-11");
  expect(screen.getByLabelText("Biography Text")).toHaveClass("min-w-0 max-w-full");
  expect(screen.getByRole("link", { name: "View Coach Record" })).toHaveClass("min-h-11 w-full sm:w-auto");
  expect(screen.getByRole("button", { name: "Save Bio" })).toHaveClass("min-h-11 w-full sm:w-auto");
  expect(screen.getByRole("button", { name: "Delete Bio" })).toHaveClass("min-h-11 w-full sm:w-auto");
});
