import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => "/portal/workshops/ws-1",
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/lib/auth/authorization", () => ({
  requireCoach: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  db: {
    workshop: {
      findFirst: jest.fn(),
    },
    workflowAssignment: {
      findMany: jest.fn(),
    },
    survey: {
      count: jest.fn(),
    },
    approvalQueue: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    fileAttachment: {
      findMany: jest.fn(),
    },
    registration: {
      findMany: jest.fn(),
    },
    landingPage: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@/components/ui/status-pill", () => ({
  StatusPill: ({ status }: { status: string }) => <span>{status}</span>,
}));

jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock("@/components/workshops/cancel-workshop-dialog", () => ({
  CancelWorkshopDialog: () => null,
}));

jest.mock("@/components/workshops/resubmit-workshop", () => ({
  ResubmitWorkshop: () => null,
}));

jest.mock("@/components/ui/copy-url-button", () => ({
  CopyUrlButton: ({ url }: { url: string }) => <span>{url}</span>,
}));

jest.mock("@/components/workshops/coach-response-form", () => ({
  CoachResponseForm: () => null,
}));

import WorkshopDetailsPage from "@/app/(portal)/portal/workshops/[id]/page";
import { requireCoach } from "@/lib/auth/authorization";
import { db } from "@/lib/db";

describe("Coach workshop detail file links", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireCoach as jest.Mock).mockResolvedValue({
      coach: { id: "coach-1" },
    });
    (db.workshop.findFirst as jest.Mock).mockResolvedValue({
      id: "ws-1",
      title: "Protected Files Workshop",
      description: "Workshop description",
      status: "PRE_EVENT",
      format: "VIRTUAL",
      eventDate: new Date("2026-04-10T00:00:00.000Z"),
      eventTime: "09:00",
      venueName: null,
      virtualLink: "https://meet.example.com/room",
      landingPageSlug: "protected-files-workshop",
      maxAttendees: 25,
      isFree: false,
      workshopType: { name: "AI Workshop" },
      _count: { registrations: 1 },
      // ENH-MAY6-1: coach detail page now also fetches the registration list
      registrations: [],
    });
    (db.workflowAssignment.findMany as jest.Mock).mockResolvedValue([]);
    (db.survey.count as jest.Mock).mockResolvedValue(0);
    (db.approvalQueue.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (db.fileAttachment.findMany as jest.Mock).mockResolvedValue([
      {
        id: "file-1",
        filename: "Agenda.pdf",
        blobUrl: "https://blob.example.com/private/agenda.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
        category: "AGENDA",
      },
    ]);
    (db.registration.findMany as jest.Mock).mockResolvedValue([
      { amountPaidCents: 10000 },
    ]);
    (db.landingPage.findFirst as jest.Mock).mockResolvedValue(null);
  });

  it("renders protected internal download links instead of raw blob URLs", async () => {
    const element = await WorkshopDetailsPage({
      params: Promise.resolve({ id: "ws-1" }),
    });

    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("/api/files/file-1/download");
    expect(markup).toContain("Agenda.pdf");
    expect(markup).toContain("[AGENDA]");
    expect(markup).toContain("1.0 KB");
    expect(markup).not.toContain("https://blob.example.com/private/agenda.pdf");
  });

  it("BUG-03: renders Open landing page link next to copy-URL button (target=_blank, rel=noopener)", async () => {
    const element = await WorkshopDetailsPage({
      params: Promise.resolve({ id: "ws-1" }),
    });

    const markup = renderToStaticMarkup(element);

    // The page renders a CopyUrlButton (mocked as span containing the URL) for the landing page.
    // BUG-03 adds a sibling Open anchor pointing at the same URL with target="_blank".
    expect(markup).toMatch(/<a[^>]+href="[^"]*\/workshop\/protected-files-workshop"[^>]*target="_blank"[^>]*>[^<]*Open/);
    expect(markup).toMatch(/rel="[^"]*noopener[^"]*"/);
  });

  it("BUG-04: View Registrations link IS visible when workshop status is PRE_EVENT", async () => {
    // Default beforeEach already sets status: PRE_EVENT
    const element = await WorkshopDetailsPage({
      params: Promise.resolve({ id: "ws-1" }),
    });
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain("View Registrations");
  });

  it("BUG-04: View Registrations link is HIDDEN when workshop status is REQUESTED", async () => {
    // Override the workshop status to REQUESTED (no registrations possible — landing page not live)
    (db.workshop.findFirst as jest.Mock).mockResolvedValueOnce({
      id: "ws-1",
      title: "Pending Workshop",
      description: "Not yet approved",
      status: "REQUESTED",
      format: "VIRTUAL",
      eventDate: new Date("2026-04-10T00:00:00.000Z"),
      eventTime: "09:00",
      venueName: null,
      virtualLink: "https://meet.example.com/room",
      landingPageSlug: "pending-workshop",
      maxAttendees: 25,
      isFree: false,
      workshopType: { name: "AI Workshop" },
      _count: { registrations: 0 },
      registrations: [],
    });
    const element = await WorkshopDetailsPage({
      params: Promise.resolve({ id: "ws-1" }),
    });
    const markup = renderToStaticMarkup(element);
    expect(markup).not.toContain("View Registrations");
  });
});
