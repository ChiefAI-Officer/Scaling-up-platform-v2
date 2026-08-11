jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

const mockRequireCoach = jest.fn();
jest.mock("@/lib/auth/authorization", () => ({
  requireCoach: () => mockRequireCoach(),
}));

jest.mock("@/lib/auth/access-control", () => ({
  normalizeRole: (role: string) => role,
}));

const mockCanAccessOrganization = jest.fn();
const mockCanAccessTemplate = jest.fn();
jest.mock("@/lib/assessments/access-control", () => ({
  asAccessDb: (value: unknown) => value,
  canAccessOrganization: (...args: unknown[]) => mockCanAccessOrganization(...args),
  canAccessTemplate: (...args: unknown[]) => mockCanAccessTemplate(...args),
}));

jest.mock("@/lib/db", () => ({ db: {} }));

jest.mock("@/lib/assessments/wave-d-feature-flags", () => ({
  waveDCustomHtmlEmailEnabled: () => true,
  assessmentInviteBrandedCustomHtmlEnabled: () => false,
  waveDAutoSendEnabled: () => false,
  waveDResultsEmailEnabled: () => false,
  waveDCoachNotifyEnabled: () => false,
}));
jest.mock("@/lib/assessments/wave-m-flags", () => ({
  isCustomSlidesEnabled: () => false,
}));
jest.mock("@/lib/assessments/wave-q-flags", () => ({
  isWaveQAdminControlsEnabled: () => false,
}));
jest.mock("@/lib/assessments/wave-osr-flags", () => ({
  isOnScreenResultsEnabled: () => false,
}));
jest.mock("@/lib/assessments/wave-admin-owned-assessment-presentation-flags", () => ({
  isAdminOwnedAssessmentPresentationEnabled: () => false,
}));

let capturedProps: Record<string, unknown> = {};
jest.mock("@/components/assessments/CampaignWizard", () => ({
  CampaignWizard: (props: Record<string, unknown>) => {
    capturedProps = props;
    return null;
  },
}));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NewCampaignPage from "@/app/(portal)/portal/assessments/new/page";

const ENV_KEYS = [
  "WAVE_INVITATION_BANNER_ENABLED",
  "WAVE_INVITATION_BANNER_CANARY",
  "WAVE_INVITATION_BANNER_KILL",
] as const;

async function renderPage() {
  capturedProps = {};
  const node = await NewCampaignPage();
  renderToStaticMarkup(node as React.ReactElement);
  return capturedProps;
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
  mockRequireCoach.mockResolvedValue({
    session: {
      user: { id: "user-1", email: "coach@example.com", role: "COACH" },
    },
    coach: { id: "coach-1" },
  });
  mockCanAccessOrganization.mockImplementation(
    async (_db: unknown, _actor: unknown, id: string) => id === "org-visible",
  );
  mockCanAccessTemplate.mockImplementation(
    async (_db: unknown, _actor: unknown, id: string) => id === "tpl-visible",
  );
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("portal new-campaign invitation banner snapshot", () => {
  it("serializes accessible Organization/Template canaries but no cross-tenant IDs", async () => {
    process.env.WAVE_INVITATION_BANNER_CANARY =
      "org-visible org-cross-tenant tpl-visible tpl-cross-tenant";

    await renderPage();

    expect(capturedProps.invitationBannerGate).toEqual({
      globallyEnabled: false,
      canaryIds: ["org-visible", "tpl-visible"],
    });
    expect(JSON.stringify(capturedProps)).not.toContain("org-cross-tenant");
    expect(JSON.stringify(capturedProps)).not.toContain("tpl-cross-tenant");
  });

  it("preserves global enablement without serializing the configured canary list", async () => {
    process.env.WAVE_INVITATION_BANNER_ENABLED = "1";
    process.env.WAVE_INVITATION_BANNER_CANARY = "org-cross-tenant tpl-cross-tenant";

    await renderPage();

    expect(capturedProps.invitationBannerGate).toEqual({
      globallyEnabled: true,
      canaryIds: [],
    });
    expect(mockCanAccessOrganization).not.toHaveBeenCalled();
    expect(mockCanAccessTemplate).not.toHaveBeenCalled();
  });

  it("lets KILL fail closed without exposing any configured canary", async () => {
    process.env.WAVE_INVITATION_BANNER_CANARY = "org-visible tpl-visible";
    process.env.WAVE_INVITATION_BANNER_KILL = "1";

    await renderPage();

    expect(capturedProps.invitationBannerGate).toEqual({
      globallyEnabled: false,
      canaryIds: [],
    });
    expect(mockCanAccessOrganization).not.toHaveBeenCalled();
    expect(mockCanAccessTemplate).not.toHaveBeenCalled();
  });
});
