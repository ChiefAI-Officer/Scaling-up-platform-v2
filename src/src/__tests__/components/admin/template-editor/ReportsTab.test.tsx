import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReportsTab } from "@/components/admin/template-editor/ReportsTab";
import { loadSafeReportHtml } from "@/lib/assessments/report-html";

const value = {
  schemaVersion: 1 as const,
  introductionHtml: "<p>Intro</p>",
  conclusionHtml: "<p>CTA</p>",
};

const previewValue = loadSafeReportHtml({ reportHtml: value });

describe("ReportsTab", () => {
  it("describes the protected Welcome and Closing regions accurately", () => {
    render(
      <ReportsTab
        value={value}
        previewValue={previewValue}
        onChange={jest.fn()}
        isReadOnly={false}
      />,
    );

    expect(screen.getByText("Add optional content to the Welcome and Closing sections. The generated report between them stays unchanged.")).toBeInTheDocument();
    expect(screen.getByText("Welcome section")).toBeInTheDocument();
    expect(screen.getByText("Replaces the default Welcome content on page 2.")).toBeInTheDocument();
    expect(screen.getByText("Closing message")).toBeInTheDocument();
    expect(screen.getByText("Appears after the respondent's score and strongest/focus summary on page 25. It replaces only the default next steps and coach link.")).toBeInTheDocument();
    expect(screen.getByText("Scores, phase, You and Peers comparisons, explanations, feedback, and question order are generated automatically and cannot be replaced here.")).toBeInTheDocument();
    expect(screen.queryByText(/Add HTML before and after/i)).toBeNull();
    expect(screen.getByLabelText("Introduction / preface HTML")).toHaveValue(
      "<p>Intro</p>",
    );
    expect(screen.getByLabelText("Introduction / preface HTML")).toHaveAttribute("maxlength", "12000");
    expect(screen.getByText("Generated report")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Conclusion / call-to-action HTML"),
    ).toHaveValue("<p>CTA</p>");
    expect(screen.getByLabelText("Conclusion / call-to-action HTML")).toHaveAttribute("maxlength", "12000");
    expect(screen.queryByText(/WYSIWYG|Add block|preset/i)).toBeNull();
  });

  it("updates one fragment without changing the other", () => {
    const onChange = jest.fn();
    render(
      <ReportsTab
        value={value}
        previewValue={previewValue}
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

  it("renders only the server-canonical preview while the draft is unsafe", () => {
    const unsafeDraft = {
      ...value,
      introductionHtml: '<script>bad()</script><p onclick="bad()">Draft</p>',
    };
    render(
      <ReportsTab
        value={unsafeDraft}
        previewValue={previewValue}
        onChange={jest.fn()}
        isReadOnly={false}
      />,
    );

    const preview = screen.getByTestId("report-html-preview-introduction");
    expect(preview).toHaveTextContent("Intro");
    expect(preview).not.toHaveTextContent("Draft");
    expect(preview.querySelector("script")).toBeNull();
    expect(screen.queryByTitle("Introduction HTML preview")).toBeNull();
    expect(screen.getAllByText("Preview updates after you save the draft.")).toHaveLength(2);
  });

  it("disables both fields for a published version", () => {
    render(
      <ReportsTab
        value={value}
        previewValue={previewValue}
        onChange={jest.fn()}
        isReadOnly
      />,
    );

    expect(screen.getByLabelText("Introduction / preface HTML")).toBeDisabled();
    expect(
      screen.getByLabelText("Conclusion / call-to-action HTML"),
    ).toBeDisabled();
  });
});
