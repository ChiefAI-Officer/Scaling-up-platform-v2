import React from "react";
import { render } from "@testing-library/react";

const mockRequireCoach = jest.fn();
jest.mock("@/lib/auth/authorization", () => ({
  requireCoach: (...args: unknown[]) => mockRequireCoach(...args),
}));

const mockCampaignFindFirst = jest.fn();
const mockCampaignFindMany = jest.fn();
const mockVersionFindMany = jest.fn();
jest.mock("@/lib/db", () => ({
  db: {
    assessmentCampaign: {
      findFirst: (...args: unknown[]) => mockCampaignFindFirst(...args),
      findMany: (...args: unknown[]) => mockCampaignFindMany(...args),
    },
    assessmentTemplateVersion: {
      findMany: (...args: unknown[]) => mockVersionFindMany(...args),
    },
  },
}));

jest.mock("@/lib/assessments/wave-83-flags", () => ({
  isReferredResultsEnabled: jest.fn(() => true),
}));
jest.mock("@/components/ui/animated", () => ({
  FadeUp: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/ui/copy-url-button", () => ({
  CopyUrlButton: () => null,
}));

let listProps: Record<string, unknown> | null = null;
jest.mock("@/components/assessments/CampaignsListWithFilter", () => ({
  CampaignsListWithFilter: (props: Record<string, unknown>) => {
    listProps = props;
    return null;
  },
}));

import CoachAssessmentsPage from "@/app/(portal)/portal/assessments/page";

const pinned = {
  templateId: "tpl-1",
  versionNumber: 3,
  language: "enUS",
  publishedAt: new Date("2026-07-01T00:00:00.000Z"),
  archivedAt: null,
};

const campaign = {
  id: "c1",
  name: "Acme Q3",
  alias: "acme-q3",
  status: "ACTIVE",
  openAt: new Date("2026-07-31T00:00:00.000Z"),
  template: { id: "tpl-1", name: "QSP v2" },
  version: pinned,
  organization: { id: "org-1", name: "Acme" },
  participants: [],
  invitations: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  listProps = null;
  mockRequireCoach.mockResolvedValue({
    coach: { id: "coach-1", email: "coach@example.com" },
  });
  mockCampaignFindFirst.mockResolvedValue(null);
  mockCampaignFindMany.mockResolvedValue([campaign]);
  mockVersionFindMany.mockResolvedValue([pinned]);
});

it("projects and resolves the same edition DTO as the admin list", async () => {
  render(await CoachAssessmentsPage());

  expect(
    (mockCampaignFindMany.mock.calls[0][0] as {
      include: Record<string, unknown>;
    }).include,
  ).toMatchObject({
    version: {
      select: {
        templateId: true,
        versionNumber: true,
        language: true,
        publishedAt: true,
        archivedAt: true,
      },
    },
  });
  expect(mockVersionFindMany).toHaveBeenCalledTimes(1);
  expect(listProps).toMatchObject({
    campaigns: [
      expect.objectContaining({
        id: "c1",
        edition: {
          versionNumber: 3,
          newerEditionAvailable: false,
          pinnedRetired: false,
        },
      }),
    ],
  });
  expect(mockCampaignFindFirst).not.toHaveBeenCalled();
});
