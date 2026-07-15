/**
 * ED6 Task 12 — published (read-only) gating reuse. The single-column surface
 * consumes the SAME `isReadOnly` signal (= version.publishedAt !== null) the
 * other surfaces do; every mutation affordance disappears/disables by construction
 * (no surface-specific gating). Inherited key/type/option locks are QuestionInspector's
 * (verbatim-reused) and covered by its own suite; here we prove the published path.
 */
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));
const mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => ({
    get: (k: string) => mockSearchParams.get(k),
    toString: () => mockSearchParams.toString(),
  }),
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_2/edit",
}));
jest.mock("@/components/admin/template-editor/sections-serialization", () => {
  const actual = jest.requireActual(
    "@/components/admin/template-editor/sections-serialization",
  );
  let n = 0;
  return { ...actual, genUid: jest.fn(() => `uid-${++n}`) };
});
afterEach(() => cleanup());

function publishedProps() {
  return {
    template: {
      id: "tpl_1",
      name: "Alpha",
      alias: "ALPHA",
      aggregationMode: "FULL_VISIBILITY" as const,
      accessMode: "INVITED" as const,
    },
    version: {
      id: "ver_2",
      versionNumber: 2,
      language: "en-US",
      publishedAt: "2026-01-01T00:00:00.000Z", // PUBLISHED ⇒ read-only
      contentHash: "abcdef012345",
      sections: [{ stableKey: "S1", name: "Financials" }],
      questions: [
        {
          stableKey: "S1_rev",
          sectionStableKey: "S1",
          label: "Revenue",
          type: "SLIDER_LIKERT",
          isRequired: true,
          sortOrder: 1,
          scale: { min: 0, max: 10, step: 1, anchorMin: "Low", anchorMax: "High" },
        },
      ],
      scoringConfig: {},
      reportConfig: null,
    },
    allVersions: [
      { id: "ver_2", versionNumber: 2, language: "en-US", publishedAt: "2026-01-01T00:00:00.000Z", contentHash: "abcdef012345" },
    ],
    publishedQuestionKeys: ["S1_rev"],
    publishedOptionKeys: {} as Record<string, string[]>,
    waveQEnabled: true,
    questionEditorUnlocked: true,
    findingsEnabled: true,
    conditionalAuthoringEnabled: true,
    testModeEnabled: true,
    safeToPublishEnabled: true,
    singleColumnEnabled: true,
  };
}

describe("SingleColumnFormBuilder — published read-only (ED6 T12)", () => {
  it("hides every mutation affordance when the version is published", () => {
    render(<TemplateEditorTabbed {...publishedProps()} />);
    expect(document.querySelector('[data-testid^="drag-handle-"]')).toBeNull();
    expect(document.querySelector('[data-testid^="sc-section-add-q-"]')).toBeNull();
    expect(document.querySelector('[data-testid^="sc-section-delete-"]')).toBeNull();
    expect(document.querySelector('[data-testid^="card-duplicate-"]')).toBeNull();
    expect(document.querySelector('[data-testid^="card-delete-"]')).toBeNull();
    expect(document.querySelector('[data-testid^="card-move-"]')).toBeNull();
    // The section-name field is disabled (not a rename affordance).
    expect(screen.getByTestId("sc-section-name-S1")).toBeDisabled();
  });

  it("focusing a card still previews it, with a disabled (read-only) inspector", () => {
    render(<TemplateEditorTabbed {...publishedProps()} />);
    // Focus is navigation, not mutation — still allowed.
    fireEvent.click(screen.getByRole("button", { name: "Revenue" }));
    expect(screen.getByTestId("questions-config-form")).toBeInTheDocument();
    // A representative inspector field is disabled (isReadOnly threaded through).
    expect(screen.getByDisplayValue("Revenue")).toBeDisabled();
  });
});
