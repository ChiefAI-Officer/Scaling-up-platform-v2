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
  it("shows the two raw HTML regions around the generated report", () => {
    render(
      <ReportsTab
        value={value}
        previewValue={previewValue}
        onChange={jest.fn()}
        isReadOnly={false}
      />,
    );

    expect(screen.getByLabelText("Introduction / preface HTML")).toHaveValue(
      "<p>Intro</p>",
    );
    expect(screen.getByText("Generated report")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Conclusion / call-to-action HTML"),
    ).toHaveValue("<p>CTA</p>");
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
