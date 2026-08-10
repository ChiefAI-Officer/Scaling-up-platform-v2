import { act, renderHook } from "@testing-library/react";
import { useTemplateEditorDraft } from "@/components/admin/template-editor/hooks/useTemplateEditorDraft";
import type {
  TemplateEditorTabbedTemplate,
  TemplateEditorTabbedVersion,
} from "@/components/admin/template-editor/TabbedShell";
import { GENERIC_INVITED_WELCOME_CONFIG } from "@/lib/assessments/invited-welcome-config";

const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

const template: TemplateEditorTabbedTemplate = {
  id: "tpl-1",
  name: "Alpha",
  alias: "alpha",
  aggregationMode: "FULL_VISIBILITY",
  invitedWelcomeDefault: GENERIC_INVITED_WELCOME_CONFIG,
};
const version: TemplateEditorTabbedVersion = {
  id: "ver-1",
  versionNumber: 1,
  language: "enUS",
  publishedAt: null,
  contentHash: "abc",
  questions: [],
  sections: [],
  scoringConfig: {},
  reportConfig: null,
};

function renderDraft() {
  return renderHook(() =>
    useTemplateEditorDraft({
      template,
      version,
      publishedQuestionKeys: [],
      publishedOptionKeys: {},
      questionEditorUnlocked: true,
      waveQEnabled: false,
      ed10Active: true,
    }),
  );
}

describe("Welcome screen Save Draft", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("validates before dispatch and keeps Welcome dirty on invalid input", async () => {
    global.fetch = jest.fn();
    const { result } = renderDraft();
    act(() => result.current.handleWelcomeFieldChange({ headingTemplate: "No token" }));

    await act(async () => result.current.handleSaveDraft());

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.dirtyFlags.welcome).toBe(true);
    expect(result.current.welcomeErrors.headingTemplate).toBeTruthy();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Could not save Welcome screen" }),
    );
  });

  it("sends only invitedWelcomeDefault when only Welcome is dirty", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200 }) as Response);
    const { result } = renderDraft();
    act(() => result.current.handleWelcomeFieldChange({ eyebrow: "Join us" }));

    await act(async () => result.current.handleSaveDraft());

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/assessment-templates/tpl-1",
      expect.objectContaining({
        body: JSON.stringify({
          invitedWelcomeDefault: {
            eyebrow: "Join us",
            headingTemplate: "{{campaignName}}",
            ledeParagraphs: GENERIC_INVITED_WELCOME_CONFIG.ledeParagraphs,
            sharingHeading: GENERIC_INVITED_WELCOME_CONFIG.sharingHeading,
            scoresHeading: GENERIC_INVITED_WELCOME_CONFIG.scoresHeading,
            scoresDescription: GENERIC_INVITED_WELCOME_CONFIG.scoresDescription,
            ctaLabel: GENERIC_INVITED_WELCOME_CONFIG.ctaLabel,
          },
        }),
      }),
    );
    expect(result.current.dirtyFlags.welcome).toBeUndefined();
    expect(toastMock).toHaveBeenCalledWith({ title: "Draft saved" });
  });

  it("does not report success when the version succeeds but Welcome fails", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return { ok: url.includes("/versions/") , status: url.includes("/versions/") ? 200 : 500 } as Response;
    });
    const { result } = renderDraft();
    act(() => {
      result.current.handleWelcomeFieldChange({ eyebrow: "Join us" });
      result.current.handleVersionFieldChange({ language: "en" });
    });

    await act(async () => result.current.handleSaveDraft());

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.current.dirtyFlags.welcome).toBe(true);
    expect(toastMock).not.toHaveBeenCalledWith({ title: "Draft saved" });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Could not save draft",
        description: expect.stringContaining("Welcome screen"),
      }),
    );
  });
});
