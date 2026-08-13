import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_1/edit",
}));

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  mockSearchParams = new URLSearchParams("");
});

function responsiveEditorProps(
  overrides: { formsBuildEnabled?: boolean; previewSettingsEnabled?: boolean } = {},
) {
  return {
    template: {
      id: "tpl_1",
      name: "Responsive template",
      alias: "RESPONSIVE",
      aggregationMode: "FULL_VISIBILITY" as const,
      accessMode: "INVITED" as const,
    },
    version: {
      id: "ver_1",
      versionNumber: 1,
      language: "en-US",
      publishedAt: null,
      contentHash: "abcdef012345",
      sections: [
        { stableKey: "S1", name: "First section" },
        { stableKey: "S2", name: "Second section" },
      ],
      questions: [
        {
          stableKey: "S1_q1",
          sectionStableKey: "S1",
          label: "First question",
          type: "SLIDER_LIKERT" as const,
          isRequired: true,
          sortOrder: 1,
          scale: { min: 0, max: 10, step: 1, anchorMin: "Low", anchorMax: "High" },
        },
      ],
      scoringConfig: {},
      reportConfig: null,
    },
    allVersions: [
      {
        id: "ver_1",
        versionNumber: 1,
        language: "en-US",
        publishedAt: null,
        contentHash: "abcdef012345",
      },
    ],
    publishedQuestionKeys: [] as string[],
    publishedOptionKeys: {} as Record<string, string[]>,
    questionEditorUnlocked: true,
    findingsEnabled: true,
    conditionalAuthoringEnabled: true,
    singleColumnEnabled: true,
    formsBuildEnabled: overrides.formsBuildEnabled ?? false,
    previewSettingsEnabled: overrides.previewSettingsEnabled ?? true,
    mobileResponsiveEnabled: true,
  };
}

describe("template editor mobile-responsive presentation", () => {
  it("contains the editor at compact widths without disconnecting add, move, or delete commands", () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);

    render(<TemplateEditorTabbed {...responsiveEditorProps()} />);

    expect(screen.getByRole("tablist", { name: "Template editor tabs" })).toHaveAttribute(
      "data-responsive-tabs",
    );
    expect(screen.getByTestId("single-column-builder")).toHaveClass("min-w-0");
    expect(screen.getByTestId("template-editor-save-draft-btn")).toBeVisible();
    expect(screen.getByTestId("template-editor-publish-btn")).toBeVisible();

    fireEvent.click(screen.getByTestId("sc-section-add-q-S1"));
    expect(screen.getAllByTestId(/^question-card-/)).toHaveLength(2);
    expect(screen.getByTestId("questions-config-form")).toHaveClass("min-w-0");
    expect(screen.getByTestId("questions-config-form")).toHaveClass("break-words");
    expect(screen.getByTestId("questions-config-form")).toHaveAttribute(
      "data-responsive-inspector",
    );

    fireEvent.click(screen.getByTestId("sc-section-down-S1"));
    expect(screen.getAllByRole("group").map((node) => node.getAttribute("aria-label"))).toEqual([
      "Second section",
      "First section",
    ]);

    fireEvent.click(screen.getByTestId("sc-section-delete-S2"));
    expect(screen.queryByTestId("sc-section-S2")).not.toBeInTheDocument();
  });

  it("contains the active ED9/ED10 Forms builder while leaving its commands reachable", () => {
    render(
      <TemplateEditorTabbed
        {...responsiveEditorProps({
          formsBuildEnabled: true,
          previewSettingsEnabled: true,
        })}
      />,
    );

    const buildTab = screen.getByRole("tab", { name: "Build" });
    act(() => {
      fireEvent.mouseDown(buildTab);
      fireEvent.focus(buildTab);
      fireEvent.click(buildTab);
    });

    expect(screen.getByTestId("forms-builder")).toHaveClass("min-w-0");
    expect(screen.getByTestId("forms-builder")).toHaveClass("max-w-full");
    expect(screen.getByTestId("forms-builder")).toHaveClass("break-words");
    expect(screen.getByTestId("forms-builder")).toHaveAttribute(
      "data-responsive-builder",
    );

    fireEvent.click(screen.getByTestId("section-menu-S1"));
    fireEvent.click(screen.getByTestId("section-menu-S1-add-question"));
    expect(screen.getAllByTestId(/^form-question-card-/)).toHaveLength(2);
  });
});
