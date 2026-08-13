import { fireEvent, render, screen } from "@testing-library/react";

const mockResponsiveFlag = jest.fn(() => false);
jest.mock("@/lib/mobile-responsive-flags", () => ({
  isMobileResponsiveEnabled: () => mockResponsiveFlag(),
}));

const templates = [
  {
    id: "template-1",
    name: "AI Workshop Solo Landing",
    templateType: "SOLO_LANDING",
    categoryId: "category-1",
    category: { id: "category-1", name: "AI", slug: "ai" },
    isActive: true,
    updatedAt: new Date("2026-08-12T00:00:00.000Z"),
  },
];

const mockTemplateFindMany = jest.fn().mockResolvedValue(templates);
const mockCategoryFindMany = jest.fn().mockResolvedValue([
  { id: "category-1", name: "AI", slug: "ai" },
]);
jest.mock("@/lib/db", () => ({
  db: {
    pageTemplate: { findMany: (...args: unknown[]) => mockTemplateFindMany(...args) },
    category: { findMany: (...args: unknown[]) => mockCategoryFindMany(...args) },
  },
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));
jest.mock("@/components/ui/animated", () => ({
  FadeUp: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  StaggerContainer: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  StaggerItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import TemplatesPage from "@/app/(dashboard)/templates/page";

beforeEach(() => {
  jest.clearAllMocks();
  mockResponsiveFlag.mockReturnValue(false);
  mockTemplateFindMany.mockResolvedValue(templates);
  mockCategoryFindMany.mockResolvedValue([{ id: "category-1", name: "AI", slug: "ai" }]);
});

it("preserves the existing template cards when responsive mode is disabled", async () => {
  render(await TemplatesPage({ searchParams: Promise.resolve({ tab: "category-1" }) }));

  expect(screen.queryByRole("list", { name: "Templates" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Create Template" })).not.toHaveClass("min-h-11");
  expect(screen.getByRole("link", { name: "Edit" })).not.toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Active" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
});

it("renders the real template identity and actions in compact records", async () => {
  mockResponsiveFlag.mockReturnValue(true);
  render(await TemplatesPage({ searchParams: Promise.resolve({ tab: "category-1" }) }));

  const list = screen.getByRole("list", { name: "Templates" });
  expect(list).toHaveTextContent("AI Workshop Solo Landing");
  expect(list).toHaveTextContent("Solo Landing Page");
  expect(list).toHaveTextContent("AI");
  expect(list).toHaveTextContent("Active");

  expect(screen.getByRole("link", { name: "Edit template" })).toHaveAttribute(
    "href",
    "/templates/template-1/edit",
  );
  expect(screen.getByRole("link", { name: "Edit template" })).toHaveClass("min-h-11");
  expect(screen.getByRole("tab", { name: "AI" })).toHaveClass("min-h-11");
  expect(screen.getByRole("link", { name: "Edit" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Active" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("min-h-11");

  fireEvent.keyDown(
    screen.getByRole("button", { name: "More actions for AI Workshop Solo Landing" }),
    { key: "ArrowDown" },
  );
  expect(screen.getByRole("menuitem", { name: "Deactivate template" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Delete template" })).toBeInTheDocument();
});

it("keeps the compact delete confirmation mounted with 44px dialog actions", async () => {
  mockResponsiveFlag.mockReturnValue(true);
  mockTemplateFindMany.mockResolvedValue([{ ...templates[0], isActive: false }]);
  render(await TemplatesPage({ searchParams: Promise.resolve({ tab: "category-1" }) }));

  fireEvent.keyDown(
    screen.getByRole("button", { name: "More actions for AI Workshop Solo Landing" }),
    { key: "ArrowDown" },
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete template" }));

  expect(screen.getByRole("dialog", { name: "Delete template" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Delete Template" })).toHaveClass("min-h-11");
});
