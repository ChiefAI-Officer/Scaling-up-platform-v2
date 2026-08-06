/**
 * Wave ED10 (spec 19am §3.3, plan Task 8) — SettingsTab.
 *
 * The consolidated Settings column that replaces the Metadata field wall. One
 * plain-language column, TWO save lanes:
 *   - Save-Draft lane (draft-only, disabled when published): Invitation email
 *     (Subject/Message) + Language. Wired to onTemplateFieldChange /
 *     onVersionFieldChange (the header "Save Draft" button persists them).
 *   - Per-card Save lane (editable while published): Aggregation + Results
 *     email. Each card has its own Save button → handleTemplateRowSave (Task 7);
 *     NOT gated by isReadOnly.
 *
 * Results-email approval interlock (SEC-H2): approval always corresponds to the
 * currently-saved content — the "Approved to send" toggle is DISABLED while the
 * card is dirty; toggling it sends content + approval together; a content Save
 * sends resultsEmailContentApproved:false (mirrors the server auto-clear) and
 * coerces empty strings → null.
 *
 * These tests exercise the component in isolation (Task 10 mounts it in the
 * shell). Copy is verbatim from C-2.
 */
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

import {
  SettingsTab,
  type SettingsTabProps,
} from "@/components/admin/template-editor/SettingsTab";

// next/link renders a plain anchor in the browser; mock it so this standalone
// component test stays hermetic (no AppRouterContext needed). Faithful to the
// DOM Link emits — the test only asserts the href.
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => cleanup());

// ── Fixtures ────────────────────────────────────────────────────────────────
function makeProps(overrides: Partial<SettingsTabProps> = {}): SettingsTabProps {
  return {
    templateValues: {
      name: "Scaling Up Assessment",
      alias: "scaling-up-full",
      description: "The full assessment.",
      invitationSubject: "You're invited",
      invitationBodyMarkdown: "Hi {{respondentFirstName}}",
      resultsEmailSubject: "Your results",
      resultsEmailBodyMarkdown: "Here are your results",
      resultsEmailContentApproved: false,
      aggregationMode: "CEO_ONLY",
    },
    language: "enUS",
    isReadOnly: false,
    onTemplateFieldChange: jest.fn(),
    onVersionFieldChange: jest.fn(),
    handleTemplateRowSave: jest.fn(),
    templateRowSaving: false,
    templateRowError: null,
    sendResultsDefault: false,
    onSendResultsDefaultChange: jest.fn(),
    savingSendResultsDefault: false,
    waveQEnabled: true,
    reportStylePreviewCapabilities: {
      reportType: "scored",
      hasMetrics: true,
      hasNarrativeResponses: false,
    },
    ...overrides,
  };
}

function renderTab(overrides: Partial<SettingsTabProps> = {}) {
  const props = makeProps(overrides);
  render(<SettingsTab {...props} />);
  return props;
}

// ── C-2 copy ──────────────────────────────────────────────────────────────
describe("SettingsTab — C-2 copy (verbatim)", () => {
  it("renders the Access read-only fact (no PUBLIC radio, no access radiogroup)", () => {
    renderTab();
    expect(screen.getByText(/Invited only/)).toBeInTheDocument();
    expect(
      screen.getByText(/each respondent gets a private magic link; answers are attributable/),
    ).toBeInTheDocument();
    // No PUBLIC radio, no access radiogroup.
    expect(screen.queryByText("PUBLIC")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /PUBLIC/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radiogroup", { name: /access/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the aggregation heading + humanized radio copy", () => {
    renderTab();
    expect(screen.getByText("Who sees individual answers")).toBeInTheDocument();
    expect(screen.getByText("Everyone")).toBeInTheDocument();
    expect(screen.getByText("CEO only")).toBeInTheDocument();
    expect(
      screen.getByText("All viewers see each person's individual answers."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Others see just their own answers; the CEO sees the team average (no individual rows).",
      ),
    ).toBeInTheDocument();
  });

  it("renders the Language label + helper", () => {
    renderTab();
    expect(screen.getByLabelText("Language")).toBeInTheDocument();
    expect(
      screen.getByText("Applies to this version's content"),
    ).toBeInTheDocument();
  });

  it("renders the Invitation email card copy + Subject/Message + Insert", () => {
    renderTab();
    const card = screen.getByTestId("settings-invitation-card");
    expect(
      within(card).getByText("Sent when a respondent is invited."),
    ).toBeInTheDocument();
    expect(within(card).getByLabelText("Subject")).toBeInTheDocument();
    expect(within(card).getByLabelText("Message")).toBeInTheDocument();
    expect(within(card).getByText("Insert")).toBeInTheDocument();
  });

  it("renders the Results email card copy + Subject/Message + Insert + toggles", () => {
    renderTab();
    const card = screen.getByTestId("settings-results-card");
    expect(
      within(card).getByText(/Sends each respondent their own result/),
    ).toBeInTheDocument();
    expect(
      within(card).getByText(/it never includes anyone else's data/),
    ).toBeInTheDocument();
    expect(within(card).getByLabelText("Subject")).toBeInTheDocument();
    expect(within(card).getByLabelText("Message")).toBeInTheDocument();
    expect(within(card).getByText("Insert")).toBeInTheDocument();
    // Toggle copy.
    expect(within(card).getByText("Approved to send")).toBeInTheDocument();
    expect(
      within(card).getByText("Turn on once the copy is reviewed."),
    ).toBeInTheDocument();
    expect(
      within(card).getByText("Send results to respondents by default"),
    ).toBeInTheDocument();
    expect(
      within(card).getByText("Applies once the results email is approved."),
    ).toBeInTheDocument();
  });

  it("renders the Access groups link row → /admin/assessments/access-groups", () => {
    renderTab();
    expect(
      screen.getByText("Manage who's allowed to take this assessment."),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Manage/ });
    expect(link).toHaveAttribute("href", "/admin/assessments/access-groups");
  });

  it("renders the impact line on the editable-while-published cards", () => {
    renderTab();
    const impacts = screen.getAllByText(
      /Changes apply to every campaign launched from this assessment \(including live ones\)/,
    );
    // Aggregation card + Results email card.
    expect(impacts.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Access / aggregation ────────────────────────────────────────────────────
describe("SettingsTab — aggregation (per-card Save lane)", () => {
  it("humanizes the aggregation labels (no raw enum strings shown)", () => {
    renderTab();
    expect(screen.queryByText("FULL_VISIBILITY")).not.toBeInTheDocument();
    expect(screen.queryByText("CEO_ONLY")).not.toBeInTheDocument();
    // Values stay the enum strings (serialization contract).
    expect(
      screen.getByRole("radio", { name: "Everyone" }),
    ).toHaveAttribute("value", "FULL_VISIBILITY");
    expect(
      screen.getByRole("radio", { name: "CEO only" }),
    ).toHaveAttribute("value", "CEO_ONLY");
  });

  it("Save calls handleTemplateRowSave({ aggregationMode }) with the picked value", () => {
    const props = renderTab();
    fireEvent.click(screen.getByRole("radio", { name: "Everyone" }));
    fireEvent.click(screen.getByTestId("settings-aggregation-save"));
    expect(props.handleTemplateRowSave).toHaveBeenCalledWith({
      aggregationMode: "FULL_VISIBILITY",
    });
  });

  it("aggregation Save works on a PUBLISHED version (not gated by isReadOnly)", () => {
    const props = renderTab({ isReadOnly: true });
    // Radios stay interactive while published.
    const everyone = screen.getByRole("radio", { name: "Everyone" });
    expect(everyone).not.toBeDisabled();
    fireEvent.click(everyone);
    fireEvent.click(screen.getByTestId("settings-aggregation-save"));
    expect(props.handleTemplateRowSave).toHaveBeenCalledWith({
      aggregationMode: "FULL_VISIBILITY",
    });
  });
});

// ── Invitation email / language (Save-Draft lane) ──────────────────────────
describe("SettingsTab — Save-Draft lane (invitation email + language)", () => {
  it("wires invitation Subject/Message to onTemplateFieldChange", () => {
    const props = renderTab();
    const card = screen.getByTestId("settings-invitation-card");
    fireEvent.change(within(card).getByLabelText("Subject"), {
      target: { value: "New subject" },
    });
    expect(props.onTemplateFieldChange).toHaveBeenCalledWith({
      invitationSubject: "New subject",
    });
    fireEvent.change(within(card).getByLabelText("Message"), {
      target: { value: "New body" },
    });
    expect(props.onTemplateFieldChange).toHaveBeenCalledWith({
      invitationBodyMarkdown: "New body",
    });
  });

  it("an Insert chip appends the token to the invitation Message (Save-Draft)", () => {
    const props = renderTab();
    const card = screen.getByTestId("settings-invitation-card");
    // {{campaignName}} is invitation-only (not in RESULTS_VARS) → unambiguous.
    fireEvent.click(within(card).getByRole("button", { name: "{{campaignName}}" }));
    expect(props.onTemplateFieldChange).toHaveBeenCalledWith({
      invitationBodyMarkdown: "Hi {{respondentFirstName}}{{campaignName}}",
    });
  });

  it("DISABLES the invitation Subject/Message on a published version", () => {
    renderTab({ isReadOnly: true });
    const card = screen.getByTestId("settings-invitation-card");
    expect(within(card).getByLabelText("Subject")).toBeDisabled();
    expect(within(card).getByLabelText("Message")).toBeDisabled();
  });

  it("Language select: friendly labels, real stored values, wired to onVersionFieldChange", () => {
    const props = renderTab();
    const select = screen.getByLabelText("Language") as HTMLSelectElement;
    expect(select.value).toBe("enUS");
    // Friendly label text on real stored values.
    expect(screen.getByRole("option", { name: "English (US)" })).toHaveValue(
      "enUS",
    );
    expect(screen.getByRole("option", { name: "English (UK)" })).toHaveValue(
      "enGB",
    );
    expect(screen.getByRole("option", { name: "Spanish (Spain)" })).toHaveValue(
      "esES",
    );
    expect(screen.getByRole("option", { name: "French (France)" })).toHaveValue(
      "frFR",
    );
    fireEvent.change(select, { target: { value: "frFR" } });
    expect(props.onVersionFieldChange).toHaveBeenCalledWith({ language: "frFR" });
  });

  it("Language select is DISABLED on a published version", () => {
    renderTab({ isReadOnly: true });
    expect(screen.getByLabelText("Language")).toBeDisabled();
  });
});

// ── Results-email approval interlock (SEC-H2) ──────────────────────────────
describe("SettingsTab — results-email approval interlock (SEC-H2)", () => {
  it("results Subject/Message stay editable on a PUBLISHED version", () => {
    renderTab({ isReadOnly: true });
    const card = screen.getByTestId("settings-results-card");
    expect(within(card).getByLabelText("Subject")).not.toBeDisabled();
    expect(within(card).getByLabelText("Message")).not.toBeDisabled();
    expect(screen.getByTestId("settings-results-save")).toBeInTheDocument();
  });

  it("approve toggle is ENABLED when the card is clean", () => {
    renderTab();
    expect(
      screen.getByRole("switch", { name: "Approved to send" }),
    ).not.toBeDisabled();
  });

  it("approve toggle is DISABLED while the card is dirty (unsaved content edit)", () => {
    renderTab();
    const card = screen.getByTestId("settings-results-card");
    fireEvent.change(within(card).getByLabelText("Subject"), {
      target: { value: "Changed subject" },
    });
    expect(
      screen.getByRole("switch", { name: "Approved to send" }),
    ).toBeDisabled();
  });

  it("toggling approve (clean) sends content + approved together", () => {
    const props = renderTab();
    fireEvent.click(screen.getByRole("switch", { name: "Approved to send" }));
    expect(props.handleTemplateRowSave).toHaveBeenCalledWith({
      resultsEmailContentApproved: true,
      resultsEmailSubject: "Your results",
      resultsEmailBodyMarkdown: "Here are your results",
    });
  });

  it("content Save sends resultsEmailContentApproved:false (mirror auto-clear)", () => {
    const props = renderTab();
    const card = screen.getByTestId("settings-results-card");
    fireEvent.change(within(card).getByLabelText("Subject"), {
      target: { value: "Edited subject" },
    });
    fireEvent.click(screen.getByTestId("settings-results-save"));
    expect(props.handleTemplateRowSave).toHaveBeenCalledWith({
      resultsEmailSubject: "Edited subject",
      resultsEmailBodyMarkdown: "Here are your results",
      resultsEmailContentApproved: false,
    });
  });

  it("an empty results field coerces to null on Save", () => {
    const props = renderTab();
    const card = screen.getByTestId("settings-results-card");
    fireEvent.change(within(card).getByLabelText("Subject"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByTestId("settings-results-save"));
    expect(props.handleTemplateRowSave).toHaveBeenCalledWith({
      resultsEmailSubject: null,
      resultsEmailBodyMarkdown: "Here are your results",
      resultsEmailContentApproved: false,
    });
  });

  it("drives the displayed approved state from templateValues (server truth)", () => {
    renderTab({
      templateValues: {
        ...makeProps().templateValues,
        resultsEmailContentApproved: true,
      },
    });
    expect(
      screen.getByRole("switch", { name: "Approved to send" }),
    ).toBeChecked();
  });

  it("Send-by-default toggle → onSendResultsDefaultChange (Wave Q)", () => {
    const props = renderTab({ sendResultsDefault: false });
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Send results to respondents by default",
      }),
    );
    expect(props.onSendResultsDefaultChange).toHaveBeenCalledWith(true);
  });

  it("hides the Send-by-default toggle when waveQEnabled is false", () => {
    renderTab({ waveQEnabled: false });
    expect(
      screen.queryByRole("switch", {
        name: "Send results to respondents by default",
      }),
    ).not.toBeInTheDocument();
    // The approval toggle still renders.
    expect(
      screen.getByRole("switch", { name: "Approved to send" }),
    ).toBeInTheDocument();
  });
});

// ── Advanced / dedup guarantees ────────────────────────────────────────────
describe("SettingsTab — Advanced alias + dedup (no Sections / PUBLIC / v7.5)", () => {
  it("shows the Alias read-only with the locked explanation", () => {
    renderTab();
    const alias = screen.getByLabelText("Alias");
    expect(alias).toBeDisabled();
    expect(alias).toHaveValue("scaling-up-full");
    expect(
      screen.getByText(
        "Used internally to wire reports, benchmarks, and links. Changing it can silently break existing campaigns, so it's locked here.",
      ),
    ).toBeInTheDocument();
  });

  it("has NO Sections card, NO PUBLIC radio, NO v7.5 badge, NO flag-constant copy", () => {
    renderTab();
    expect(screen.queryByText(/Sections/)).not.toBeInTheDocument();
    expect(screen.queryByText("PUBLIC")).not.toBeInTheDocument();
    expect(screen.queryByText("v7.5")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/INVITED_RESULTS_EMAIL_COPY_APPROVED/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/FULL_VISIBILITY/)).not.toBeInTheDocument();
  });
});
