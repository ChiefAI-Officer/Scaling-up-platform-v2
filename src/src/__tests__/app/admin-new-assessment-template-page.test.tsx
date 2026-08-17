/**
 * Protects the new-template route's server-resolved release gate: a missing or
 * inverted flag branch must not expose the simplified form before it is live.
 */

import { render } from "@testing-library/react";
import "@testing-library/jest-dom";

jest.mock("next/navigation", () => ({
  redirect: jest.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;${url}`,
    });
  }),
}));

const mockGetServerSession = jest.fn();
jest.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));

const mockIsEnabled = jest.fn();
jest.mock("@/lib/assessments/wave-template-creation-flags", () => ({
  isTemplateCreationSimplifiedEnabled: () => mockIsEnabled(),
}));

const mockIsPresentationEnabled = jest.fn();
jest.mock("@/lib/assessments/wave-admin-owned-assessment-presentation-flags", () => ({
  isAdminOwnedAssessmentPresentationEnabled: () => mockIsPresentationEnabled(),
}));

const mockResponsiveFlag = jest.fn(() => false);
jest.mock("@/lib/mobile-responsive-flags", () => ({
  isMobileResponsiveEnabled: () => mockResponsiveFlag(),
}));

let legacyFormProps: {
  mode?: "create" | "edit";
  responsiveEnabled?: boolean;
  deliveryTypeEnabled?: boolean;
} | null = null;
jest.mock("@/components/admin/AssessmentTemplateForm", () => ({
  AssessmentTemplateForm: (props: {
    mode?: "create" | "edit";
    responsiveEnabled?: boolean;
    deliveryTypeEnabled?: boolean;
  }) => {
    legacyFormProps = props;
    return <div data-testid="legacy-template-form" />;
  },
}));
jest.mock("@/components/admin/SimplifiedAssessmentTemplateForm", () => ({
  SimplifiedAssessmentTemplateForm: ({
    welcomeAuthoringEnabled,
  }: {
    welcomeAuthoringEnabled?: boolean;
  }) => (
    <div
      data-testid="simplified-template-form"
      data-welcome-enabled={String(welcomeAuthoringEnabled)}
    />
  ),
}));

import NewAssessmentTemplatePage from "@/app/(dashboard)/admin/assessments/templates/new/page";

beforeEach(() => {
  jest.clearAllMocks();
  mockGetServerSession.mockResolvedValue({ user: { role: "ADMIN" } });
  mockIsEnabled.mockReturnValue(false);
  mockIsPresentationEnabled.mockReturnValue(false);
  mockResponsiveFlag.mockReturnValue(false);
  legacyFormProps = null;
});

describe("NewAssessmentTemplatePage auth gate", () => {
  it("redirects unauthenticated users to login", async () => {
    mockGetServerSession.mockResolvedValue(null);

    await expect(NewAssessmentTemplatePage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;/login",
    });
  });

  it("redirects COACH users to unauthorized", async () => {
    mockGetServerSession.mockResolvedValue({ user: { role: "COACH" } });

    await expect(NewAssessmentTemplatePage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;/unauthorized",
    });
  });

  it.each(["ADMIN", "STAFF"])("renders for %s users", async (role) => {
    mockGetServerSession.mockResolvedValue({ user: { role } });

    render(await NewAssessmentTemplatePage());

    expect(mockGetServerSession).toHaveBeenCalledTimes(1);
  });
});

describe("NewAssessmentTemplatePage release gate", () => {
  it("keeps the legacy heading and form while the simplified flow is inactive", async () => {
    mockIsEnabled.mockReturnValue(false);

    const legacy = render(await NewAssessmentTemplatePage());

    expect(legacy.getByText("New Assessment Template")).toBeInTheDocument();
    expect(legacy.getByTestId("legacy-template-form")).toBeInTheDocument();
    expect(legacy.queryByTestId("simplified-template-form")).toBeNull();
  });

  it("forwards the root mobile flag to the legacy form only when enabled", async () => {
    render(await NewAssessmentTemplatePage());
    expect(legacyFormProps).toEqual({
      mode: "create",
      responsiveEnabled: false,
      deliveryTypeEnabled: false,
    });

    mockResponsiveFlag.mockReturnValue(true);
    render(await NewAssessmentTemplatePage());
    expect(legacyFormProps).toEqual({
      mode: "create",
      responsiveEnabled: true,
      deliveryTypeEnabled: false,
    });
  });

  it("shows the simplified heading, guidance, and form when the flow is active", async () => {
    mockIsEnabled.mockReturnValue(true);

    const simplified = render(await NewAssessmentTemplatePage());

    expect(simplified.getByText("Create assessment")).toBeInTheDocument();
    expect(
      simplified.getByText(
        "Give it a name. You'll add questions and settings in the editor next.",
      ),
    ).toBeInTheDocument();
    expect(simplified.getByTestId("simplified-template-form")).toBeInTheDocument();
    expect(simplified.queryByTestId("legacy-template-form")).toBeNull();
  });

  it.each([
    [true, true, "true"],
    [true, false, "false"],
    [false, true, "false"],
  ])(
    "enables welcome authoring only when simplified creation and presentation are active",
    async (simplifiedEnabled, presentationEnabled, expectedWelcomeEnabled) => {
      mockIsEnabled.mockReturnValue(simplifiedEnabled);
      mockIsPresentationEnabled.mockReturnValue(presentationEnabled);

      const view = render(await NewAssessmentTemplatePage());

      if (simplifiedEnabled) {
        expect(view.getByTestId("simplified-template-form")).toHaveAttribute(
          "data-welcome-enabled",
          expectedWelcomeEnabled,
        );
      } else {
        expect(view.getByTestId("legacy-template-form")).toBeInTheDocument();
      }
    },
  );
});
