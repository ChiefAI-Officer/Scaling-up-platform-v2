import type { ComponentType } from "react";
import { render, screen } from "@testing-library/react";
import { SurveyTemplateEditor } from "@/components/surveys/survey-template-editor";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));

const ResponsiveSurveyTemplateEditor = SurveyTemplateEditor as ComponentType<
  React.ComponentProps<typeof SurveyTemplateEditor> & { responsiveEnabled?: boolean }
>;

const template = {
  id: "template-1",
  name: "An unusually long survey template name that must reflow",
  description: null,
  surveyType: "POST_WORKSHOP",
  isActive: true,
  categoryId: null,
  createdBy: "admin-1",
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
  questions: [],
  surveys: [],
};

it("reflows the enabled survey-template header and real actions without changing default-off structure", () => {
  const enabled = render(
    <ResponsiveSurveyTemplateEditor
      template={template}
      workshops={[]}
      categories={[]}
      isNew={false}
      responsiveEnabled
    />,
  );

  const enabledHeading = screen.getByRole("heading", { name: template.name });
  expect(enabledHeading.closest("div.space-y-6")).toHaveClass("min-w-0 max-w-full");
  expect(enabledHeading.parentElement?.parentElement).toHaveClass(
    "min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between",
  );
  expect(screen.getByRole("button", { name: "Delete Template" }).parentElement).toHaveClass(
    "w-full flex-col items-stretch sm:w-auto sm:flex-row sm:items-center",
  );
  expect(screen.getByRole("button", { name: "Delete Template" })).toHaveClass(
    "min-h-11 min-w-11 w-full sm:w-auto",
  );
  enabled.unmount();

  render(
    <ResponsiveSurveyTemplateEditor
      template={template}
      workshops={[]}
      categories={[]}
      isNew={false}
    />,
  );

  const disabledHeading = screen.getByRole("heading", { name: template.name });
  expect(disabledHeading.closest("div.space-y-6")).toHaveAttribute("class", "space-y-6");
  expect(disabledHeading.parentElement?.parentElement).toHaveAttribute(
    "class",
    "flex items-center justify-between",
  );
  expect(screen.getByRole("button", { name: "Delete Template" }).parentElement).toHaveAttribute(
    "class",
    "flex items-center gap-3",
  );
  expect(screen.getByRole("button", { name: "Delete Template" })).toHaveAttribute(
    "class",
    "text-sm text-destructive hover:text-destructive/80",
  );
});
