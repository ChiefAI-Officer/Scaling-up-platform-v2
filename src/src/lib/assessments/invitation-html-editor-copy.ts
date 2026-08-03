import type { InvitationHtmlMode } from "@/lib/assessments/invitation-html-policy";

export function invitationOverrideSummary(input: {
  htmlMode: InvitationHtmlMode;
  hasSubjectOrMarkdown: boolean;
  emptySummary: string;
}): string {
  if (input.htmlMode === "branded_body") {
    return "Branded custom HTML body set for this campaign";
  }
  if (input.htmlMode === "full_replace") {
    return "Full custom HTML replaces the branded email";
  }
  if (input.htmlMode === "branded_fallback") {
    return "Custom HTML retained but inactive — branded template fallback will send";
  }
  return input.hasSubjectOrMarkdown
    ? "Custom subject/body set for this campaign"
    : input.emptySummary;
}

export function invitationHtmlEditorCopy(input: {
  brandedCustomHtmlEnabled: boolean;
  htmlMode: InvitationHtmlMode;
}): {
  label: "Custom HTML body (advanced)" | "Full custom HTML (advanced)";
  description: string;
  validationError: string | null;
} {
  if (input.brandedCustomHtmlEnabled) {
    return {
      label: "Custom HTML body (advanced)",
      description:
        "Scaling Up branding, available Coach identity, the assessment button/link, and the footer are added automatically. This HTML replaces only the markdown body. {{invitationUrl}} is optional; the same merge tokens above are available.",
      validationError: null,
    };
  }

  if (input.htmlMode === "branded_fallback") {
    return {
      label: "Full custom HTML (advanced)",
      description:
        "This custom HTML is retained but inactive. The branded markdown/template fallback will send. Add {{invitationUrl}} to edit it as a full replacement, or clear it.",
      validationError: "Full custom HTML must include {{invitationUrl}} or be cleared.",
    };
  }

  return {
    label: "Full custom HTML (advanced)",
    description:
      "When set, this HTML replaces the entire branded email (no template wrap). It must include the survey link token {{invitationUrl}} either as a link href or as plain text. The same merge tokens above are available.",
    validationError: null,
  };
}

export function invitationSaveConfirmation(input: {
  htmlMode: InvitationHtmlMode;
  hasSubjectOrMarkdown: boolean;
}): string {
  if (input.htmlMode === "branded_body") {
    return "Branded custom HTML body saved.";
  }
  if (input.htmlMode === "full_replace") {
    return "Full custom HTML replacement saved.";
  }
  if (input.htmlMode === "branded_fallback") {
    return "Custom HTML retained but inactive — branded template fallback will send.";
  }
  return input.hasSubjectOrMarkdown
    ? "New campaign overrides applied."
    : "Using template default.";
}
