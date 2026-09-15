import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReportsTab } from "@/components/admin/template-editor/ReportsTab";

const value = {
  schemaVersion: 1 as const,
  introductionHtml: "<p>Intro</p>",
  conclusionHtml: "<p>CTA</p>",
};

describe("ReportsTab", () => {
  it("describes the protected Welcome and Closing regions accurately", () => {
    render(
      <ReportsTab
        value={value}
        previewHref="/admin/assessments/templates/tpl_1/versions/ver_2/preview-report"
        historicalPreviewHref="/admin/assessments/templates/tpl_1/versions/ver_2/preview-report?peerReference=historical"
        previewDisabled={false}
        onChange={jest.fn()}
        isReadOnly={false}
      />,
    );

    expect(screen.getByText("Add optional content to the Welcome and Closing sections. The generated report between them stays unchanged.")).toBeInTheDocument();
    expect(screen.getByText("Welcome section")).toBeInTheDocument();
    expect(screen.getByText("Replaces the default Welcome content on page 2.")).toBeInTheDocument();
    expect(screen.getByText("Closing message")).toBeInTheDocument();
    expect(screen.getByText("Appears after the respondent's score and strongest/focus summary on page 25. It replaces only the default next steps and coach link.")).toBeInTheDocument();
    expect(screen.getByText("Closing images may use paired whole-number width and height attributes from 1 to 2,000 pixels. Images stay inside the report column and keep their proportions.")).toBeInTheDocument();
    expect(screen.getAllByText(/images may use paired whole-number width/i)).toHaveLength(1);
    expect(screen.getAllByText("HTML + CSS")).toHaveLength(2);
    expect(screen.getAllByText("Write HTML and optional CSS in a <style> tag. Styles apply only inside this section.")).toHaveLength(2);
    expect(screen.getAllByText("Use classes for styling. CSS cannot use global definitions such as @keyframes or @property; responsive @media, @supports, @container, and nested @scope rules are supported. @import and non-HTTPS URLs are blocked. Position supports only static, relative, or absolute. CSS escapes, variables, and attribute/environment substitution are not supported. Scripts, event handlers, and platform page-shell class names are removed on save.")).toHaveLength(2);
    expect(screen.getByText("Scores, phase, You and Peers comparisons, explanations, feedback, and question order are generated automatically and cannot be replaced here.")).toBeInTheDocument();
    expect(screen.queryByText(/Add HTML before and after/i)).toBeNull();
    expect(screen.getByLabelText("Introduction / preface HTML")).toHaveValue(
      "<p>Intro</p>",
    );
    expect(screen.getByText("Generated report")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Conclusion / call-to-action HTML"),
    ).toHaveValue("<p>CTA</p>");
    expect(screen.queryByText(/WYSIWYG|Add block|preset/i)).toBeNull();
  });

  it("shows unsafe CSS feedback before save", () => {
    render(
      <ReportsTab
        value={{ ...value, conclusionHtml: "<style>@import 'bad.css';</style><p>CTA</p>" }}
        previewHref="/preview-report"
        historicalPreviewHref={null}
        previewDisabled={false}
        onChange={jest.fn()}
        isReadOnly={false}
      />,
    );

    expect(screen.getByLabelText("Conclusion / call-to-action HTML")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Closing message CSS cannot use @import. Write the CSS directly in this editor.",
    );
  });

  it("retains an oversized edit and explains why it cannot be saved", () => {
    function StatefulReportsTab() {
      const [current, setCurrent] = React.useState(value);
      return (
        <ReportsTab
          value={current}
          previewHref="/admin/assessments/templates/tpl_1/versions/ver_2/preview-report"
          historicalPreviewHref={null}
          previewDisabled={false}
          onChange={setCurrent}
          isReadOnly={false}
        />
      );
    }

    render(<StatefulReportsTab />);
    const input = screen.getByLabelText("Introduction / preface HTML");
    const oversized = "x".repeat(12_001);

    fireEvent.change(input, { target: { value: oversized } });

    expect(input).toHaveValue(oversized);
    expect(input).not.toHaveAttribute("maxlength");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Welcome section is 1 character over the 12,000-character limit (12,001 entered).",
    );
    expect(screen.getByText("12,001 / 12,000")).toHaveClass("text-destructive");
  });

  it("updates one fragment without changing the other", () => {
    const onChange = jest.fn();
    render(
      <ReportsTab
        value={value}
        previewHref="/admin/assessments/templates/tpl_1/versions/ver_2/preview-report"
        historicalPreviewHref={null}
        previewDisabled={false}
        onChange={onChange}
        isReadOnly={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Introduction / preface HTML"), {
      target: { value: "<h2>New intro</h2>" },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      schemaVersion: 1,
      introductionHtml: "<h2>New intro</h2>",
      conclusionHtml: "<p>CTA</p>",
    });
  });

  it("shows the same three available fields beside both report regions", () => {
    render(
      <ReportsTab
        value={value}
        previewHref="/admin/assessments/templates/tpl_1/versions/ver_2/preview-report"
        historicalPreviewHref={null}
        previewDisabled={false}
        onChange={jest.fn()}
        isReadOnly={false}
      />,
    );

    expect(screen.getAllByText("Available fields")).toHaveLength(2);
    expect(screen.getAllByText("{{respondentFirstName}}")).toHaveLength(2);
    expect(screen.getAllByText("{{respondentName}}")).toHaveLength(2);
    expect(screen.getAllByText("{{companyName}}")).toHaveLength(2);
    expect(
      screen.getAllByText(
        "First name from the respondent record or public submission. Uses “there” when unavailable.",
      ),
    ).toHaveLength(2);
  });

  it("inserts a field over the current selection and restores the caret", async () => {
    function StatefulReportsTab() {
      const [current, setCurrent] = React.useState(value);
      return (
        <ReportsTab
          value={current}
          previewHref="/admin/assessments/templates/tpl_1/versions/ver_2/preview-report"
          historicalPreviewHref={null}
          previewDisabled={false}
          onChange={setCurrent}
          isReadOnly={false}
        />
      );
    }

    render(<StatefulReportsTab />);
    const welcome = screen.getByLabelText(
      "Introduction / preface HTML",
    ) as HTMLTextAreaElement;
    welcome.focus();
    welcome.setSelectionRange(3, 8);

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Insert First name placeholder",
      })[0],
    );

    expect(welcome).toHaveValue("<p>{{respondentFirstName}}</p>");
    await waitFor(() => {
      expect(welcome).toHaveFocus();
      expect(welcome.selectionStart).toBe(26);
      expect(welcome.selectionEnd).toBe(26);
    });
  });

  it("marks unsupported placeholders invalid while preserving the edit", () => {
    function StatefulReportsTab() {
      const [current, setCurrent] = React.useState(value);
      return (
        <ReportsTab
          value={current}
          previewHref="/admin/assessments/templates/tpl_1/versions/ver_2/preview-report"
          historicalPreviewHref={null}
          previewDisabled={false}
          onChange={setCurrent}
          isReadOnly={false}
        />
      );
    }

    render(<StatefulReportsTab />);
    const welcome = screen.getByLabelText("Introduction / preface HTML");
    fireEvent.change(welcome, {
      target: { value: "<p>{{unknownField}}</p>" },
    });

    expect(welcome).toHaveValue("<p>{{unknownField}}</p>");
    expect(welcome).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("{{unknownField}}");
  });

  it("offers only saved full-report previews and disables them while report content is dirty", () => {
    render(
      <ReportsTab
        value={value}
        previewHref="/admin/assessments/templates/tpl_1/versions/ver_2/preview-report"
        historicalPreviewHref="/admin/assessments/templates/tpl_1/versions/ver_2/preview-report?peerReference=historical"
        previewDisabled
        onChange={jest.fn()}
        isReadOnly={false}
      />,
    );

    expect(screen.getByText("Full report preview")).toBeInTheDocument();
    expect(screen.getByText("Preview uses the last saved content, exact report styling, and representative respondent and company details.")).toBeInTheDocument();
    expect(screen.getByText("Save the draft to preview your latest changes.")).toBeInTheDocument();
    expect(screen.queryByTestId("report-html-preview-introduction")).toBeNull();
    expect(screen.queryByTestId("report-html-preview-conclusion")).toBeNull();
    expect(screen.getByRole("link", { name: "Open full report preview" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "Open historical report preview" })).toHaveAttribute("aria-disabled", "true");
  });

  it("disables both fields for a published version", () => {
    render(
      <ReportsTab
        value={value}
        previewHref="/admin/assessments/templates/tpl_1/versions/ver_2/preview-report"
        historicalPreviewHref={null}
        previewDisabled={false}
        onChange={jest.fn()}
        isReadOnly
      />,
    );

    expect(screen.getByLabelText("Introduction / preface HTML")).toBeDisabled();
    expect(
      screen.getByLabelText("Conclusion / call-to-action HTML"),
    ).toBeDisabled();
    for (const button of screen.getAllByRole("button", {
      name: /Insert .* placeholder/,
    })) {
      expect(button).toBeDisabled();
    }
  });

  it("shows canonical source, CSS, layout, and structure capacity when expanded limits are enabled", () => {
    render(
      <ReportsTab
        value={{
          ...value,
          introductionHtml:
            '<style>.hero{display:grid}</style><section class="hero"><img src="https://cdn.scalingup.com/one.png"><img src="https://cdn.scalingup.com/two.png"><h2>Welcome</h2><table><tbody><tr><td>Cell</td></tr></tbody></table></section>',
        }}
        previewHref="/preview-report"
        historicalPreviewHref={null}
        previewDisabled={false}
        onChange={jest.fn()}
        isReadOnly={false}
        limitsExpansionEnabled
      />,
    );

    expect(
      screen.getAllByText(
        "Images may use paired whole-number width and height attributes from 1 to 2,000 pixels. Images stay inside the report column and keep their proportions.",
      ),
    ).toHaveLength(2);
    expect(screen.getByTestId("report-introduction-html-capacity")).toHaveTextContent(
      "Source",
    );
    expect(screen.getByTestId("report-introduction-html-capacity")).toHaveTextContent(
      "CSS",
    );
    expect(screen.getByTestId("report-introduction-html-capacity")).toHaveTextContent(
      "Layout",
    );
    expect(screen.getByTestId("report-introduction-html-capacity")).toHaveTextContent(
      "Text",
    );
    expect(screen.getByTestId("report-introduction-html-capacity")).toHaveTextContent(
      "Elements",
    );
    expect(screen.getByTestId("report-introduction-html-capacity")).toHaveTextContent(
      "Depth",
    );
    expect(screen.getByTestId("report-introduction-html-capacity")).toHaveTextContent(
      "2 images",
    );
    expect(screen.getByTestId("report-introduction-html-capacity")).toHaveTextContent(
      "Rows 1 / 8",
    );
  });
});
