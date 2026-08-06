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

jest.mock("@/components/admin/AssessmentTemplateForm", () => ({
  AssessmentTemplateForm: () => <div data-testid="legacy-template-form" />,
}));
jest.mock("@/components/admin/SimplifiedAssessmentTemplateForm", () => ({
  SimplifiedAssessmentTemplateForm: () => (
    <div data-testid="simplified-template-form" />
  ),
}));

import NewAssessmentTemplatePage from "@/app/(dashboard)/admin/assessments/templates/new/page";

beforeEach(() => {
  jest.clearAllMocks();
  mockGetServerSession.mockResolvedValue({ user: { role: "ADMIN" } });
  mockIsEnabled.mockReturnValue(false);
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
});
