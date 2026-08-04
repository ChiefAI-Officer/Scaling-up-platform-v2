import {
  invitationHtmlEditorCopy,
  invitationOverrideSummary,
  invitationSaveConfirmation,
} from "@/lib/assessments/invitation-html-editor-copy";

describe("invitationOverrideSummary", () => {
  it.each([
    ["branded_body", "Branded custom HTML body set for this campaign"],
    ["full_replace", "Full custom HTML replaces the branded email"],
    [
      "branded_fallback",
      "Custom HTML retained but inactive — branded template fallback will send",
    ],
  ] as const)("maps %s to exact product copy", (htmlMode, expected) => {
    expect(
      invitationOverrideSummary({
        htmlMode,
        hasSubjectOrMarkdown: false,
        emptySummary: "Using template default",
      }),
    ).toBe(expected);
  });

  it("preserves subject/markdown and empty summaries when HTML is unused", () => {
    expect(
      invitationOverrideSummary({
        htmlMode: "none",
        hasSubjectOrMarkdown: true,
        emptySummary: "Using template default",
      }),
    ).toBe("Custom subject/body set for this campaign");
    expect(
      invitationOverrideSummary({
        htmlMode: "none",
        hasSubjectOrMarkdown: false,
        emptySummary: "Using template default",
      }),
    ).toBe("Using template default");
  });
});

describe("invitationHtmlEditorCopy", () => {
  it("describes branded HTML as a body and makes the URL token optional", () => {
    expect(
      invitationHtmlEditorCopy({
        brandedCustomHtmlEnabled: true,
        htmlMode: "none",
      }),
    ).toEqual({
      label: "Custom HTML body (advanced)",
      description:
        "Scaling Up branding, available Coach identity, the assessment button/link, and the footer are added automatically. This HTML replaces only the markdown body. {{invitationUrl}} is optional; the same merge tokens above are available.",
      validationError: null,
    });
  });

  it("describes retained tokenless HTML as inactive during rollback", () => {
    expect(
      invitationHtmlEditorCopy({
        brandedCustomHtmlEnabled: false,
        htmlMode: "branded_fallback",
      }).description,
    ).toBe(
      "This custom HTML is retained but inactive. The branded markdown/template fallback will send. Add {{invitationUrl}} to edit it as a full replacement, or clear it.",
    );
    expect(
      invitationHtmlEditorCopy({
        brandedCustomHtmlEnabled: false,
        htmlMode: "branded_fallback",
      }).validationError,
    ).toBe("Full custom HTML must include {{invitationUrl}} or be cleared.");
  });
});

describe("invitationSaveConfirmation", () => {
  it.each([
    ["branded_body", false, "Branded custom HTML body saved."],
    ["full_replace", false, "Full custom HTML replacement saved."],
    [
      "branded_fallback",
      false,
      "Custom HTML retained but inactive — branded template fallback will send.",
    ],
    ["none", true, "New campaign overrides applied."],
    ["none", false, "Using template default."],
  ] as const)(
    "maps %s with subject/markdown=%s",
    (htmlMode, hasSubjectOrMarkdown, expected) => {
      expect(
        invitationSaveConfirmation({ htmlMode, hasSubjectOrMarkdown }),
      ).toBe(expected);
    },
  );
});
