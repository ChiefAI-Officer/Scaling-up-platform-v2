/**
 * FormSectionCard — ED9 Task 8 (spec 19al-plan) tests.
 *
 * The Google-Forms-style single-column builder's per-section band, lifted to
 * its own component so the later FormsBuilder (and a future SingleColumn
 * wiring pass) can reuse it verbatim (mirrors FormQuestionCard, Task 7).
 * Renders: a collapse toggle, an inline name input (`onRename`), a
 * description field (`onSetDescription` — round-trips already, this is the
 * first UI that writes it), a "N of M labeled" count, and a ⋯ overflow menu
 * (Add question / Move up / Move down / Delete). `isReadOnly` hides the menu
 * and disables both text inputs (the collapse toggle is a pure view affordance
 * and stays enabled).
 */
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

import {
  FormSectionCard,
  type FormSectionCardProps,
} from "@/components/admin/template-editor/FormSectionCard";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

afterEach(() => cleanup());

function baseSection(overrides: Partial<SectionDraft> = {}): SectionDraft {
  return {
    uid: "sec-1",
    stableKey: "S1",
    name: "Team Culture",
    description: "",
    ...overrides,
  };
}

function baseProps(
  overrides: Partial<FormSectionCardProps> = {},
): FormSectionCardProps {
  return {
    section: baseSection(),
    labeledCount: 2,
    totalCount: 3,
    collapsed: false,
    isReadOnly: false,
    onRename: jest.fn(),
    onSetDescription: jest.fn(),
    onToggleCollapsed: jest.fn(),
    onAddQuestion: jest.fn(),
    onMoveUp: jest.fn(),
    onMoveDown: jest.fn(),
    onDelete: jest.fn(),
    ...overrides,
  };
}

describe("FormSectionCard — name + description", () => {
  it("renders a name input bound to the section name that calls onRename(uid, value)", () => {
    const onRename = jest.fn();
    render(<FormSectionCard {...baseProps({ onRename })} />);
    const name = screen.getByTestId("form-section-name-sec-1") as HTMLInputElement;
    expect(name.value).toBe("Team Culture");
    fireEvent.change(name, { target: { value: "Culture & Values" } });
    expect(onRename).toHaveBeenCalledWith("sec-1", "Culture & Values");
  });

  it("renders a description field bound to the section description that calls onSetDescription(uid, value)", () => {
    const onSetDescription = jest.fn();
    render(
      <FormSectionCard
        {...baseProps({
          onSetDescription,
          section: baseSection({ description: "Existing text" }),
        })}
      />,
    );
    const desc = screen.getByTestId(
      "form-section-description-sec-1",
    ) as HTMLTextAreaElement;
    expect(desc.value).toBe("Existing text");
    fireEvent.change(desc, { target: { value: "New description" } });
    expect(onSetDescription).toHaveBeenCalledWith("sec-1", "New description");
  });

  it("shows the placeholder copy when the description is empty", () => {
    render(
      <FormSectionCard
        {...baseProps({ section: baseSection({ description: "" }) })}
      />,
    );
    expect(
      screen.getByPlaceholderText(
        "Optional — shown above this section on the survey",
      ),
    ).toBeInTheDocument();
  });
});

describe("FormSectionCard — labeled count + collapse", () => {
  it("renders the labeled/total count", () => {
    render(<FormSectionCard {...baseProps({ labeledCount: 2, totalCount: 3 })} />);
    expect(screen.getByText("2 of 3 labeled")).toBeInTheDocument();
  });

  it("clicking the collapse toggle calls onToggleCollapsed with the stableKey", () => {
    const onToggleCollapsed = jest.fn();
    render(<FormSectionCard {...baseProps({ onToggleCollapsed })} />);
    fireEvent.click(screen.getByTestId("form-section-toggle-sec-1"));
    expect(onToggleCollapsed).toHaveBeenCalledWith("S1");
  });

  it("reflects the collapsed prop via aria-expanded", () => {
    const { rerender } = render(
      <FormSectionCard {...baseProps({ collapsed: false })} />,
    );
    expect(screen.getByTestId("form-section-toggle-sec-1")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    rerender(<FormSectionCard {...baseProps({ collapsed: true })} />);
    expect(screen.getByTestId("form-section-toggle-sec-1")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

describe("FormSectionCard — ⋯ overflow menu", () => {
  it("is closed by default and opens on click, revealing all four actions", () => {
    render(<FormSectionCard {...baseProps()} />);
    expect(screen.queryByTestId("section-menu-S1-add-question")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("section-menu-S1"));
    expect(screen.getByTestId("section-menu-S1-add-question")).toBeInTheDocument();
    expect(screen.getByTestId("section-menu-S1-move-up")).toBeInTheDocument();
    expect(screen.getByTestId("section-menu-S1-move-down")).toBeInTheDocument();
    expect(screen.getByTestId("section-menu-S1-delete")).toBeInTheDocument();
  });

  it("calls onAddQuestion with the stableKey and closes the menu", () => {
    const onAddQuestion = jest.fn();
    render(<FormSectionCard {...baseProps({ onAddQuestion })} />);
    fireEvent.click(screen.getByTestId("section-menu-S1"));
    fireEvent.click(screen.getByTestId("section-menu-S1-add-question"));
    expect(onAddQuestion).toHaveBeenCalledWith("S1");
    expect(screen.queryByTestId("section-menu-S1-add-question")).not.toBeInTheDocument();
  });

  it("calls onMoveUp with the uid", () => {
    const onMoveUp = jest.fn();
    render(<FormSectionCard {...baseProps({ onMoveUp })} />);
    fireEvent.click(screen.getByTestId("section-menu-S1"));
    fireEvent.click(screen.getByTestId("section-menu-S1-move-up"));
    expect(onMoveUp).toHaveBeenCalledWith("sec-1");
  });

  it("calls onMoveDown with the uid", () => {
    const onMoveDown = jest.fn();
    render(<FormSectionCard {...baseProps({ onMoveDown })} />);
    fireEvent.click(screen.getByTestId("section-menu-S1"));
    fireEvent.click(screen.getByTestId("section-menu-S1-move-down"));
    expect(onMoveDown).toHaveBeenCalledWith("sec-1");
  });

  it("calls onDelete with the uid, styled as destructive", () => {
    const onDelete = jest.fn();
    render(<FormSectionCard {...baseProps({ onDelete })} />);
    fireEvent.click(screen.getByTestId("section-menu-S1"));
    const del = screen.getByTestId("section-menu-S1-delete");
    expect(del.className).toContain("text-destructive");
    fireEvent.click(del);
    expect(onDelete).toHaveBeenCalledWith("sec-1");
  });
});

describe("FormSectionCard — isReadOnly", () => {
  it("hides the ⋯ menu entirely", () => {
    render(<FormSectionCard {...baseProps({ isReadOnly: true })} />);
    expect(screen.queryByTestId("section-menu-S1")).not.toBeInTheDocument();
  });

  it("disables the name and description inputs", () => {
    render(<FormSectionCard {...baseProps({ isReadOnly: true })} />);
    expect(screen.getByTestId("form-section-name-sec-1")).toBeDisabled();
    expect(screen.getByTestId("form-section-description-sec-1")).toBeDisabled();
  });
});
