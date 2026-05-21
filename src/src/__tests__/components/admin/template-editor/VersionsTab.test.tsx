/**
 * F5 — Versions tab (Checkpoint 4).
 *
 * Wireframe spec: tab is in WF16/17/18 nav (7th tab). No dedicated WF panel
 * for Versions content — implementation lifts the existing version-row UI
 * + actions from AssessmentTemplateDetail.tsx (publish/duplicate/edit per
 * row + E1.2 PublishFailureModal wiring).
 *
 * Plan: ~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md (F5 section)
 *
 * Tests written FIRST (TDD red) before implementation.
 */

import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

import {
  VersionsTab,
  type VersionsTabProps,
  type VersionRow,
} from "@/components/admin/template-editor/VersionsTab";

const versions: VersionRow[] = [
  {
    id: "ver_3",
    versionNumber: 3,
    language: "en",
    publishedAt: null,
    contentHash: "draftv3contenthash12345",
  },
  {
    id: "ver_2",
    versionNumber: 2,
    language: "en",
    publishedAt: "2026-05-15T00:00:00.000Z",
    contentHash: "publishedv2contenthash9876",
  },
  {
    id: "ver_1",
    versionNumber: 1,
    language: "en",
    publishedAt: "2026-05-05T00:00:00.000Z",
    contentHash: "publishedv1contenthash5555",
  },
];

function makeProps(overrides: Partial<VersionsTabProps> = {}): VersionsTabProps {
  return {
    templateId: "tpl_1",
    currentVersionId: "ver_3",
    versions,
    publishingVersionId: null,
    duplicatingVersionId: null,
    onPublish: jest.fn(),
    onDuplicate: jest.fn(),
    ...overrides,
  };
}

describe("VersionsTab — F5 (Checkpoint 4)", () => {
  it("renders the Version History heading", () => {
    render(<VersionsTab {...makeProps()} />);
    expect(screen.getByText(/Version History/i)).toBeInTheDocument();
  });

  it("renders one row per version", () => {
    render(<VersionsTab {...makeProps()} />);
    const rows = screen.getAllByTestId(/^version-row-/);
    expect(rows).toHaveLength(3);
  });

  it("renders versions in versionNumber-descending order (newest first)", () => {
    render(<VersionsTab {...makeProps()} />);
    const rows = screen.getAllByTestId(/^version-row-/);
    expect(rows[0]).toHaveAttribute("data-testid", "version-row-ver_3");
    expect(rows[1]).toHaveAttribute("data-testid", "version-row-ver_2");
    expect(rows[2]).toHaveAttribute("data-testid", "version-row-ver_1");
  });

  it("each row shows versionNumber + language + status pill + content hash prefix", () => {
    render(<VersionsTab {...makeProps()} />);
    const draftRow = screen.getByTestId("version-row-ver_3");
    expect(draftRow.textContent).toMatch(/v3/);
    expect(within(draftRow).getByText(/^Draft$/i)).toBeInTheDocument();
    expect(draftRow.textContent).toMatch(/draftv3conte/);

    const pubRow = screen.getByTestId("version-row-ver_2");
    expect(within(pubRow).getByText(/^Published$/i)).toBeInTheDocument();
  });

  it("draft rows have Edit + Duplicate + Publish buttons", () => {
    render(<VersionsTab {...makeProps()} />);
    const draftRow = screen.getByTestId("version-row-ver_3");
    expect(within(draftRow).getByTestId("edit-version-ver_3")).toBeInTheDocument();
    expect(within(draftRow).getByTestId("duplicate-version-ver_3")).toBeInTheDocument();
    expect(within(draftRow).getByTestId("publish-version-ver_3")).toBeInTheDocument();
  });

  it("published rows have Duplicate but NOT Edit or Publish", () => {
    render(<VersionsTab {...makeProps()} />);
    const pubRow = screen.getByTestId("version-row-ver_2");
    expect(within(pubRow).queryByTestId("edit-version-ver_2")).not.toBeInTheDocument();
    expect(within(pubRow).queryByTestId("publish-version-ver_2")).not.toBeInTheDocument();
    expect(within(pubRow).getByTestId("duplicate-version-ver_2")).toBeInTheDocument();
  });

  it("the row matching currentVersionId has an 'is-current' marker", () => {
    render(<VersionsTab {...makeProps()} />);
    const currentRow = screen.getByTestId("version-row-ver_3");
    expect(currentRow).toHaveAttribute("data-current", "true");
  });

  it("clicking Publish on a draft row calls onPublish with versionId", () => {
    const onPublish = jest.fn();
    render(<VersionsTab {...makeProps({ onPublish })} />);
    fireEvent.click(screen.getByTestId("publish-version-ver_3"));
    expect(onPublish).toHaveBeenCalledWith("ver_3");
  });

  it("clicking Duplicate on a draft row calls onDuplicate with versionId", () => {
    const onDuplicate = jest.fn();
    render(<VersionsTab {...makeProps({ onDuplicate })} />);
    fireEvent.click(screen.getByTestId("duplicate-version-ver_3"));
    expect(onDuplicate).toHaveBeenCalledWith("ver_3");
  });

  it("clicking Duplicate on a published row calls onDuplicate with that versionId", () => {
    const onDuplicate = jest.fn();
    render(<VersionsTab {...makeProps({ onDuplicate })} />);
    fireEvent.click(screen.getByTestId("duplicate-version-ver_2"));
    expect(onDuplicate).toHaveBeenCalledWith("ver_2");
  });

  it("disables all Publish buttons when publishingVersionId is set", () => {
    render(<VersionsTab {...makeProps({ publishingVersionId: "ver_3" })} />);
    const publishBtn = screen.getByTestId("publish-version-ver_3");
    expect(publishBtn).toBeDisabled();
  });

  it("disables all Duplicate buttons when duplicatingVersionId is set", () => {
    render(<VersionsTab {...makeProps({ duplicatingVersionId: "ver_2" })} />);
    const dupBtn = screen.getByTestId("duplicate-version-ver_2");
    expect(dupBtn).toBeDisabled();
  });

  it("Edit link on the current draft row points to the editor (this version)", () => {
    render(<VersionsTab {...makeProps()} />);
    const editLink = screen.getByTestId("edit-version-ver_3");
    expect(editLink).toHaveAttribute(
      "href",
      "/admin/assessments/templates/tpl_1/versions/ver_3/edit",
    );
  });

  it("renders empty-state message when versions array is empty", () => {
    render(<VersionsTab {...makeProps({ versions: [] })} />);
    expect(screen.getByText(/no versions yet/i)).toBeInTheDocument();
  });
});
