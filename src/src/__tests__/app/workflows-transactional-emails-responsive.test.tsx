import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockResponsiveFlag = jest.fn(() => true);
const mockRefresh = jest.fn();

jest.mock("@/lib/mobile-responsive-flags", () => ({
  isMobileResponsiveEnabled: () => mockResponsiveFlag(),
}));
jest.mock("next-auth", () => ({
  getServerSession: jest.fn().mockResolvedValue({ user: { role: "ADMIN" } }),
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
  notFound: jest.fn(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: mockRefresh }),
  useSearchParams: () => ({ get: jest.fn() }),
  usePathname: () => "/admin/workflows/workflow-1",
}));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));

const workflow = {
  id: "workflow-1",
  name: "Pre-event welcome",
  description: "Prepare attendees before the workshop",
  isActive: true,
  isTemplate: true,
  workflowPhase: "PRE_EVENT",
  workshopFormat: null,
  categoryId: "category-1",
  category: { name: "Growth" },
  createdBy: "admin-1",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-12T00:00:00.000Z"),
  steps: [{
    id: "step-1",
    workflowId: "workflow-1",
    sortOrder: 0,
    stepType: "EMAIL_ATTENDEES",
    triggerType: "RELATIVE_TO_EVENT",
    offsetDays: -1,
    offsetHours: 0,
    sendTimeOfDay: "09:00",
    subject: "Welcome",
    body: "Hello",
    customRecipients: null,
    attachments: null,
    isActive: true,
    emailTemplateId: null,
    surveyTemplateId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    emailTemplate: null,
  }],
  assignments: [],
  _count: { assignments: 2 },
};

const mockWorkflowFindMany = jest.fn().mockResolvedValue([workflow]);
const mockWorkflowFindUnique = jest.fn().mockResolvedValue(workflow);
const mockEmailTemplateFindMany = jest.fn().mockResolvedValue([]);
const transactionalRow = {
  emailType: "REGISTRATION_CONFIRMATION",
  subject: "Registered",
  body: "<p>Hello</p>",
  version: 3,
  updatedAt: new Date("2026-08-12T00:00:00.000Z"),
};
const mockTransactionalFindMany = jest.fn().mockResolvedValue([transactionalRow]);
const mockTransactionalFindUnique = jest.fn().mockResolvedValue(transactionalRow);

jest.mock("@/lib/db", () => ({
  db: {
    workflow: {
      findMany: (...args: unknown[]) => mockWorkflowFindMany(...args),
      findUnique: (...args: unknown[]) => mockWorkflowFindUnique(...args),
    },
    emailTemplate: { findMany: (...args: unknown[]) => mockEmailTemplateFindMany(...args) },
    workshop: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    transactionalEmailTemplate: {
      findMany: (...args: unknown[]) => mockTransactionalFindMany(...args),
      findUnique: (...args: unknown[]) => mockTransactionalFindUnique(...args),
    },
  },
}));

import { WorkflowsContent } from "@/app/(dashboard)/admin/workflows/page";
import WorkflowEditorPage from "@/app/(dashboard)/admin/workflows/[id]/page";
import TransactionalEmailsPage from "@/app/(dashboard)/admin/transactional-emails/page";
import EditTransactionalEmailPage from "@/app/(dashboard)/admin/transactional-emails/[type]/page";
import { TransactionalEmailEditor } from "@/app/(dashboard)/admin/transactional-emails/[type]/editor";
import { WorkflowTimeline } from "@/components/workflows/workflow-timeline";

beforeEach(() => {
  jest.clearAllMocks();
  mockResponsiveFlag.mockReturnValue(true);
  mockWorkflowFindMany.mockResolvedValue([workflow]);
  mockWorkflowFindUnique.mockResolvedValue(workflow);
  mockEmailTemplateFindMany.mockResolvedValue([]);
  mockTransactionalFindMany.mockResolvedValue([transactionalRow]);
  mockTransactionalFindUnique.mockResolvedValue(transactionalRow);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
});

it("renders workflow identity, trigger, state, step count, and every real collection action", async () => {
  render(await WorkflowsContent({ responsiveEnabled: true }));

  const list = await screen.findByRole("list", { name: "Workflows" });
  expect(list).toHaveTextContent("Pre-event welcome");
  expect(list).toHaveTextContent("Pre / Growth");
  expect(list).toHaveTextContent("Active");
  expect(list).toHaveTextContent("1 step");
  expect(screen.getByRole("link", { name: "Open workflow" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "More actions for Pre-event welcome" })).toHaveClass("min-h-11");
});

it("exposes compact workflow delete as a 44px keyboard-operable menuitem that preserves deletion", async () => {
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  render(await WorkflowsContent({ responsiveEnabled: true }));

  fireEvent.keyDown(screen.getByRole("button", { name: "More actions for Pre-event welcome" }), { key: "ArrowDown" });
  const deleteItem = await screen.findByRole("menuitem", { name: "Delete" });
  expect(deleteItem.tagName).toBe("BUTTON");
  expect(deleteItem).toHaveClass("min-h-11");
  fireEvent.keyDown(deleteItem, { key: "Enter" });

  expect(confirmSpy).toHaveBeenCalled();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    "/api/workflows/workflow-1",
    { method: "DELETE" },
  ));
  expect(mockRefresh).toHaveBeenCalled();
  confirmSpy.mockRestore();
});

it("keeps the workflow editor contained and gives its real controls touch targets", async () => {
  render(await WorkflowEditorPage({
    params: Promise.resolve({ id: "workflow-1" }),
    searchParams: Promise.resolve({}),
  }));

  expect(document.querySelector("[data-responsive-page-header]")).toHaveTextContent("Edit Workflow");
  expect(screen.getByRole("button", { name: "Save Workflow" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Steps (1)" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Show Variables" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "+ Add Step" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Edit" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("min-h-11");
});

it("bounds the workflow timeline in a named horizontal data region", () => {
  render(<WorkflowTimeline responsiveEnabled steps={[{
    id: "step-1",
    sortOrder: 0,
    stepType: "EMAIL_ATTENDEES",
    triggerType: "RELATIVE_TO_EVENT",
    offsetDays: -1,
    offsetHours: 0,
    sendTimeOfDay: "09:00",
    subject: "Welcome",
    isActive: true,
  }]} />);

  expect(screen.getByRole("region", { name: "Workflow timeline" })).toHaveClass("overflow-x-auto");
});

it("reflows the transactional-email collection and editor only when enabled", async () => {
  const collection = render(await TransactionalEmailsPage());
  const list = screen.getByRole("list", { name: "Transactional email templates" });
  expect(list).toHaveTextContent("Registration Confirmation");
  expect(list).toHaveTextContent("v3");
  expect(screen.getByRole("link", { name: "Edit email template" })).toHaveClass("min-h-11");
  collection.unmount();

  render(await EditTransactionalEmailPage({
    params: Promise.resolve({ type: "REGISTRATION_CONFIRMATION" }),
  }));
  expect(document.querySelector("[data-responsive-page-header]")).toHaveTextContent("Registration Confirmation");
  expect(screen.getByLabelText("Subject")).toHaveClass("min-w-0 max-w-full");
  expect(screen.getByLabelText("Body (HTML)")).toHaveClass("min-w-0 max-w-full");
  expect(screen.getByRole("button", { name: "Save" })).toHaveClass("min-h-11");
});

it("preserves transactional-email controlled state and save payload in responsive mode", async () => {
  render(<TransactionalEmailEditor
    emailType="REGISTRATION_CONFIRMATION"
    initialSubject="Original"
    initialBody="<p>Original</p>"
    version={4}
    responsiveEnabled
  />);

  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Updated" } });
  fireEvent.change(screen.getByLabelText("Body (HTML)"), { target: { value: "<p>Updated</p>" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    "/api/transactional-emails/REGISTRATION_CONFIRMATION",
    expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ subject: "Updated", body: "<p>Updated</p>", version: 4 }),
    }),
  ));
  expect(await screen.findByText("Saved.")).toBeInTheDocument();
  expect(screen.getByText("v4")).toBeInTheDocument();
});

it("preserves exact legacy responsive boundaries when the flag is disabled", async () => {
  mockResponsiveFlag.mockReturnValue(false);
  const workflows = render(await WorkflowsContent({}));
  expect(screen.queryByRole("list", { name: "Workflows" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Pre-event welcome" })).toHaveAttribute(
    "class",
    "text-primary hover:text-primary/80 font-medium",
  );
  expect(screen.getByRole("link", { name: "Preview" })).not.toHaveClass("min-h-11");
  expect(screen.getByRole("link", { name: "Edit" })).not.toHaveClass("min-h-11");
  workflows.unmount();

  const collection = render(await TransactionalEmailsPage());
  expect(screen.queryByRole("list", { name: "Transactional email templates" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
    "class",
    "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground",
  );
  collection.unmount();

  render(<TransactionalEmailEditor
    emailType="REGISTRATION_CONFIRMATION"
    initialSubject="Original"
    initialBody="<p>Original</p>"
    version={4}
  />);
  expect(screen.getByLabelText("Subject")).toHaveAttribute(
    "class",
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
  );
  expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
    "class",
    "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50",
  );
});
