/**
 * Wave ED8 (spec 19ak §7; plan T8) — VersionsTab lifecycle UI test pass.
 *
 * TESTS ONLY (zero production change). Two halves:
 *   1. Flag ON  — the derived-status lifecycle table: per-language Active
 *      picks, per-status verbs, archived-row collapse, handler payloads,
 *      in-flight disabling, and the columns that are GONE (hash / "you are
 *      here") vs the Published date column.
 *   2. Flag OFF — byte-behaviour pins on the legacy table (hash column +
 *      "(you are here)" present, legacy verbs, NO lifecycle testids even
 *      when a row carries archivedAt — spec §6 kill semantics render an
 *      archived row as a plain "Published" row).
 *
 * The pure derivation helper (`version-lifecycle.ts`) is unit-tested
 * separately — this suite asserts the RENDERED behaviour only.
 */

import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

import {
  VersionsTab,
  type VersionsTabProps,
  type VersionRow,
} from "@/components/admin/template-editor/VersionsTab";

// ────────────────────────────────────────────────────────────────────────
// Flag-ON fixtures — a multi-language, multi-status template.
//
//   en_v5  published + archived  → archived  (number > EN Active ⇒ unarchive
//                                   would become Active)
//   en_v4  draft                 → draft     (the current/open version)
//   en_v3  published             → active     (highest EN published non-arch)
//   en_v2  published             → superseded
//   es_v2  published             → active     (highest ES published non-arch)
//   en_v1  published + archived  → archived  (number < EN Active ⇒ unarchive
//                                   stays superseded)
// ────────────────────────────────────────────────────────────────────────
const lifecycleVersions: VersionRow[] = [
  {
    id: "en_v5",
    versionNumber: 5,
    language: "en-US",
    publishedAt: "2026-06-01T00:00:00.000Z",
    contentHash: "hashenv5000000000000",
    archivedAt: "2026-06-15T00:00:00.000Z",
  },
  {
    id: "en_v4",
    versionNumber: 4,
    language: "en-US",
    publishedAt: null,
    contentHash: "hashenv4draft0000000",
  },
  {
    id: "en_v3",
    versionNumber: 3,
    language: "en-US",
    publishedAt: "2026-05-20T00:00:00.000Z",
    contentHash: "hashenv3000000000000",
  },
  {
    id: "en_v2",
    versionNumber: 2,
    language: "en-US",
    publishedAt: "2026-05-10T00:00:00.000Z",
    contentHash: "hashenv2000000000000",
  },
  {
    id: "es_v2",
    versionNumber: 2,
    language: "es-ES",
    publishedAt: "2026-05-12T00:00:00.000Z",
    contentHash: "hashesv2000000000000",
  },
  {
    id: "en_v1",
    versionNumber: 1,
    language: "en-US",
    publishedAt: "2026-05-01T00:00:00.000Z",
    contentHash: "hashenv1000000000000",
    archivedAt: "2026-05-05T00:00:00.000Z",
  },
];

function makeLifecycleProps(
  overrides: Partial<VersionsTabProps> = {},
): VersionsTabProps {
  return {
    templateId: "tpl_1",
    currentVersionId: "en_v4",
    versions: lifecycleVersions,
    publishingVersionId: null,
    duplicatingVersionId: null,
    onPublish: jest.fn(),
    onDuplicate: jest.fn(),
    versionLifecycleEnabled: true,
    archivingVersionId: null,
    unarchivingVersionId: null,
    deletingVersionId: null,
    onArchive: jest.fn(),
    onUnarchive: jest.fn(),
    onDelete: jest.fn(),
    ...overrides,
  };
}

// Reveal the collapsed archived rows so their buttons/badges are queryable.
function showArchived() {
  fireEvent.click(screen.getByTestId("toggle-archived-versions"));
}

describe("VersionsTab — Wave ED8 lifecycle table (flag ON)", () => {
  describe("status assignment (incl. multi-language two-Actives)", () => {
    it("EN v3 and ES v2 are BOTH Active — one Active per language", () => {
      render(<VersionsTab {...makeLifecycleProps()} />);

      const enActive = screen.getByTestId("version-row-en_v3");
      const esActive = screen.getByTestId("version-row-es_v2");
      expect(enActive).toHaveAttribute("data-status", "active");
      expect(esActive).toHaveAttribute("data-status", "active");
      expect(within(enActive).getByText(/^Active$/)).toBeInTheDocument();
      expect(within(esActive).getByText(/^Active$/)).toBeInTheDocument();
    });

    it("EN v2 is Superseded and EN v4 is Draft", () => {
      render(<VersionsTab {...makeLifecycleProps()} />);

      const superseded = screen.getByTestId("version-row-en_v2");
      const draft = screen.getByTestId("version-row-en_v4");
      expect(superseded).toHaveAttribute("data-status", "superseded");
      expect(draft).toHaveAttribute("data-status", "draft");
      expect(within(superseded).getByText(/^Superseded$/)).toBeInTheDocument();
      expect(within(draft).getByText(/^Draft$/)).toBeInTheDocument();
    });

    it("archived rows carry data-status='archived' + an Archived badge (once shown)", () => {
      render(<VersionsTab {...makeLifecycleProps()} />);
      showArchived();

      const archived = screen.getByTestId("version-row-en_v1");
      expect(archived).toHaveAttribute("data-status", "archived");
      expect(within(archived).getByText(/^Archived$/)).toBeInTheDocument();
    });
  });

  describe("per-status verbs", () => {
    it("Active row shows Roll back… + Duplicate ONLY (no Archive/Publish/Edit/Delete)", () => {
      render(<VersionsTab {...makeLifecycleProps()} />);
      const row = screen.getByTestId("version-row-en_v3");

      expect(within(row).getByTestId("rollback-version-en_v3")).toBeInTheDocument();
      expect(within(row).getByTestId("duplicate-version-en_v3")).toBeInTheDocument();
      expect(within(row).queryByTestId("archive-version-en_v3")).not.toBeInTheDocument();
      expect(within(row).queryByTestId("publish-version-en_v3")).not.toBeInTheDocument();
      expect(within(row).queryByTestId("edit-version-en_v3")).not.toBeInTheDocument();
      expect(within(row).queryByTestId("delete-version-en_v3")).not.toBeInTheDocument();
    });

    it("Superseded row shows Archive + Duplicate (no Roll back/Publish/Edit/Delete)", () => {
      render(<VersionsTab {...makeLifecycleProps()} />);
      const row = screen.getByTestId("version-row-en_v2");

      expect(within(row).getByTestId("archive-version-en_v2")).toBeInTheDocument();
      expect(within(row).getByTestId("duplicate-version-en_v2")).toBeInTheDocument();
      expect(within(row).queryByTestId("rollback-version-en_v2")).not.toBeInTheDocument();
      expect(within(row).queryByTestId("publish-version-en_v2")).not.toBeInTheDocument();
      expect(within(row).queryByTestId("edit-version-en_v2")).not.toBeInTheDocument();
      expect(within(row).queryByTestId("delete-version-en_v2")).not.toBeInTheDocument();
    });

    it("Draft row shows Edit + Publish + Delete and NO Duplicate (spec §2 table)", () => {
      render(<VersionsTab {...makeLifecycleProps()} />);
      const row = screen.getByTestId("version-row-en_v4");

      expect(within(row).getByTestId("edit-version-en_v4")).toBeInTheDocument();
      expect(within(row).getByTestId("publish-version-en_v4")).toBeInTheDocument();
      expect(within(row).getByTestId("delete-version-en_v4")).toBeInTheDocument();
      // The lifecycle Draft row deliberately drops Duplicate (legacy had it).
      expect(within(row).queryByTestId("duplicate-version-en_v4")).not.toBeInTheDocument();
    });

    it("Archived row shows Unarchive + Duplicate (once shown)", () => {
      render(<VersionsTab {...makeLifecycleProps()} />);
      showArchived();
      const row = screen.getByTestId("version-row-en_v1");

      expect(within(row).getByTestId("unarchive-version-en_v1")).toBeInTheDocument();
      expect(within(row).getByTestId("duplicate-version-en_v1")).toBeInTheDocument();
      expect(within(row).queryByTestId("rollback-version-en_v1")).not.toBeInTheDocument();
      expect(within(row).queryByTestId("archive-version-en_v1")).not.toBeInTheDocument();
    });
  });

  describe("archived-row collapse", () => {
    it("archived rows are hidden by default; the toggle reads 'N archived — Show'", () => {
      render(<VersionsTab {...makeLifecycleProps()} />);

      expect(screen.queryByTestId("version-row-en_v5")).not.toBeInTheDocument();
      expect(screen.queryByTestId("version-row-en_v1")).not.toBeInTheDocument();

      const toggle = screen.getByTestId("toggle-archived-versions");
      expect(toggle).toHaveTextContent(/2 archived/);
      expect(toggle).toHaveTextContent(/Show/);
      expect(toggle).toHaveAttribute("aria-expanded", "false");
    });

    it("clicking the toggle reveals the archived rows and flips the label to 'Hide'", () => {
      render(<VersionsTab {...makeLifecycleProps()} />);
      const toggle = screen.getByTestId("toggle-archived-versions");

      fireEvent.click(toggle);

      expect(screen.getByTestId("version-row-en_v5")).toBeInTheDocument();
      expect(screen.getByTestId("version-row-en_v1")).toBeInTheDocument();
      expect(toggle).toHaveTextContent(/Hide/);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });

    it("the toggle is ABSENT when there are zero archived versions", () => {
      const noArchived = lifecycleVersions.filter((v) => !v.archivedAt);
      render(<VersionsTab {...makeLifecycleProps({ versions: noArchived })} />);

      expect(screen.queryByTestId("toggle-archived-versions")).not.toBeInTheDocument();
    });
  });

  describe("handler payloads", () => {
    it("Roll back on the EN Active → onArchive(id, {isActive:true, versionNumber, nextActiveVersionNumber})", () => {
      const onArchive = jest.fn();
      render(<VersionsTab {...makeLifecycleProps({ onArchive })} />);

      fireEvent.click(screen.getByTestId("rollback-version-en_v3"));
      expect(onArchive).toHaveBeenCalledWith("en_v3", {
        isActive: true,
        versionNumber: 3,
        // The EN superseded version (v2) becomes Active on roll-back.
        nextActiveVersionNumber: 2,
      });
    });

    it("Archive on a Superseded row → onArchive(id, {isActive:false, ...})", () => {
      const onArchive = jest.fn();
      render(<VersionsTab {...makeLifecycleProps({ onArchive })} />);

      fireEvent.click(screen.getByTestId("archive-version-en_v2"));
      expect(onArchive).toHaveBeenCalledWith("en_v2", {
        isActive: false,
        versionNumber: 2,
        // The EN Active (v3) is unaffected by archiving a superseded row.
        nextActiveVersionNumber: 3,
      });
    });

    it("Unarchive on an archived row ABOVE the current Active → willBecomeActive:true", () => {
      const onUnarchive = jest.fn();
      render(<VersionsTab {...makeLifecycleProps({ onUnarchive })} />);
      showArchived();

      fireEvent.click(screen.getByTestId("unarchive-version-en_v5"));
      expect(onUnarchive).toHaveBeenCalledWith("en_v5", {
        versionNumber: 5,
        willBecomeActive: true,
      });
    });

    it("Unarchive on an archived row BELOW the current Active → willBecomeActive:false", () => {
      const onUnarchive = jest.fn();
      render(<VersionsTab {...makeLifecycleProps({ onUnarchive })} />);
      showArchived();

      fireEvent.click(screen.getByTestId("unarchive-version-en_v1"));
      expect(onUnarchive).toHaveBeenCalledWith("en_v1", {
        versionNumber: 1,
        willBecomeActive: false,
      });
    });

    it("Delete on the Draft row → onDelete(id, {versionNumber})", () => {
      const onDelete = jest.fn();
      render(<VersionsTab {...makeLifecycleProps({ onDelete })} />);

      fireEvent.click(screen.getByTestId("delete-version-en_v4"));
      expect(onDelete).toHaveBeenCalledWith("en_v4", { versionNumber: 4 });
    });
  });

  describe("in-flight disabling", () => {
    it("archivingVersionId set → both Roll back AND Archive buttons disable", () => {
      render(<VersionsTab {...makeLifecycleProps({ archivingVersionId: "en_v3" })} />);

      expect(screen.getByTestId("rollback-version-en_v3")).toBeDisabled();
      expect(screen.getByTestId("archive-version-en_v2")).toBeDisabled();
    });

    it("unarchivingVersionId set → Unarchive buttons disable", () => {
      render(<VersionsTab {...makeLifecycleProps({ unarchivingVersionId: "en_v5" })} />);
      showArchived();

      expect(screen.getByTestId("unarchive-version-en_v5")).toBeDisabled();
      expect(screen.getByTestId("unarchive-version-en_v1")).toBeDisabled();
    });

    it("deletingVersionId set → the Draft Delete button disables", () => {
      render(<VersionsTab {...makeLifecycleProps({ deletingVersionId: "en_v4" })} />);

      expect(screen.getByTestId("delete-version-en_v4")).toBeDisabled();
    });
  });

  describe("columns", () => {
    it("has NO 'Content hash' column and NO '(you are here)' label in flag-ON mode", () => {
      render(<VersionsTab {...makeLifecycleProps()} />);

      expect(screen.queryByText(/Content hash/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/you are here/i)).not.toBeInTheDocument();
    });

    it("renders a Published date for published rows and '—' for drafts", () => {
      render(<VersionsTab {...makeLifecycleProps()} />);

      // Draft row's Published cell is an em-dash.
      const draft = screen.getByTestId("version-row-en_v4");
      expect(within(draft).getByText("—")).toBeInTheDocument();

      // Published (Active) row shows a formatted date — TZ-robust year check.
      const active = screen.getByTestId("version-row-en_v3");
      expect(within(active).queryByText("—")).not.toBeInTheDocument();
      expect(active).toHaveTextContent(/2026/);
    });

    it("keeps the data-current ring attribute on the current (open) row", () => {
      render(<VersionsTab {...makeLifecycleProps()} />);

      expect(screen.getByTestId("version-row-en_v4")).toHaveAttribute(
        "data-current",
        "true",
      );
      expect(screen.getByTestId("version-row-en_v3")).toHaveAttribute(
        "data-current",
        "false",
      );
    });
  });
});

// ────────────────────────────────────────────────────────────────────────
// Flag-OFF pins — the legacy table is unchanged even when a row carries
// archivedAt (spec §6 kill semantics: archived rows render as plain
// "Published"). This proves the ED8 lifecycle capability is entirely
// gated on the flag + optional handlers.
// ────────────────────────────────────────────────────────────────────────
const legacyWithArchived: VersionRow[] = [
  {
    id: "lv2",
    versionNumber: 2,
    language: "en",
    publishedAt: "2026-05-15T00:00:00.000Z",
    contentHash: "publishedhash2abcdef",
    // An archivedAt that the legacy branch MUST ignore.
    archivedAt: "2026-05-20T00:00:00.000Z",
  },
  {
    id: "lv1",
    versionNumber: 1,
    language: "en",
    publishedAt: null,
    contentHash: "drafthash1abcdef0000",
  },
];

function makeLegacyProps(
  overrides: Partial<VersionsTabProps> = {},
): VersionsTabProps {
  // NOTE: versionLifecycleEnabled unset (false) and NO lifecycle handlers —
  // exactly how a pre-ED8 render site instantiates the tab.
  return {
    templateId: "tpl_1",
    currentVersionId: "lv1",
    versions: legacyWithArchived,
    publishingVersionId: null,
    duplicatingVersionId: null,
    onPublish: jest.fn(),
    onDuplicate: jest.fn(),
    ...overrides,
  };
}

describe("VersionsTab — Wave ED8 flag-OFF pins (legacy table unchanged)", () => {
  it("renders the Content hash column and the '(you are here)' label", () => {
    render(<VersionsTab {...makeLegacyProps()} />);

    expect(screen.getByText(/Content hash/i)).toBeInTheDocument();
    expect(screen.getByText(/\(you are here\)/i)).toBeInTheDocument();
  });

  it("keeps the legacy per-row verbs (Edit/Publish/Duplicate)", () => {
    render(<VersionsTab {...makeLegacyProps()} />);

    const draft = screen.getByTestId("version-row-lv1");
    expect(within(draft).getByTestId("edit-version-lv1")).toBeInTheDocument();
    expect(within(draft).getByTestId("publish-version-lv1")).toBeInTheDocument();
    expect(within(draft).getByTestId("duplicate-version-lv1")).toBeInTheDocument();

    const published = screen.getByTestId("version-row-lv2");
    expect(within(published).getByTestId("duplicate-version-lv2")).toBeInTheDocument();
    expect(within(published).queryByTestId("edit-version-lv2")).not.toBeInTheDocument();
    expect(within(published).queryByTestId("publish-version-lv2")).not.toBeInTheDocument();
  });

  it("emits NO lifecycle testids even with an archivedAt-bearing row", () => {
    render(<VersionsTab {...makeLegacyProps()} />);

    expect(screen.queryByTestId("toggle-archived-versions")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rollback-version-lv2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("archive-version-lv2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("unarchive-version-lv2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("delete-version-lv1")).not.toBeInTheDocument();
  });

  it("renders an archivedAt-bearing published row as a plain 'Published' (never 'Archived')", () => {
    render(<VersionsTab {...makeLegacyProps()} />);

    const published = screen.getByTestId("version-row-lv2");
    expect(within(published).getByText(/^Published$/)).toBeInTheDocument();
    expect(within(published).queryByText(/^Archived$/)).not.toBeInTheDocument();
    // And no derived data-status attribute leaks into the legacy branch.
    expect(published).not.toHaveAttribute("data-status");
  });
});
