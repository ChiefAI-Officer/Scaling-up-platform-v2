/**
 * Wave ED8 (spec 19ak §2) — T7 pure status-derivation helper tests.
 *
 * Written FIRST (TDD red) before `version-lifecycle.ts`. The helper is the
 * client-side twin of the server's `active-version.ts` definition:
 *   Active     = highest versionNumber with publishedAt != null AND
 *                archivedAt == null, PER (language)
 *   Superseded = published, non-archived, not the highest
 *   Draft      = publishedAt == null
 *   Archived   = published + archivedAt != null
 *
 * Component render tests (VersionsTab table / pill / strip) are T8 — this
 * suite covers ONLY the pure derivation helpers.
 */

import {
  deriveVersionStatuses,
  deriveVersionStatus,
  nextActiveVersionNumber,
  willBecomeActiveOnUnarchive,
  type LifecycleVersionRow,
} from "@/components/admin/template-editor/version-lifecycle";

function row(
  id: string,
  versionNumber: number,
  language: string,
  publishedAt: string | null,
  archivedAt: string | null = null,
): LifecycleVersionRow {
  return { id, versionNumber, language, publishedAt, archivedAt };
}

const PUB = "2026-05-15T00:00:00.000Z";
const ARC = "2026-07-01T00:00:00.000Z";

describe("deriveVersionStatuses — Wave ED8 (spec 19ak §2)", () => {
  it("marks the highest published non-archived version Active and earlier published ones Superseded", () => {
    const rows = [
      row("v3", 3, "enUS", PUB),
      row("v2", 2, "enUS", PUB),
      row("v1", 1, "enUS", PUB),
    ];
    const statuses = deriveVersionStatuses(rows);
    expect(statuses.get("v3")).toBe("active");
    expect(statuses.get("v2")).toBe("superseded");
    expect(statuses.get("v1")).toBe("superseded");
  });

  it("derives Active PER language — EN v3 and ES v2 are BOTH Active", () => {
    const rows = [
      row("en3", 3, "enUS", PUB),
      row("en2", 2, "enUS", PUB),
      row("es2", 2, "es", PUB),
      row("es1", 1, "es", PUB),
    ];
    const statuses = deriveVersionStatuses(rows);
    expect(statuses.get("en3")).toBe("active");
    expect(statuses.get("en2")).toBe("superseded");
    expect(statuses.get("es2")).toBe("active");
    expect(statuses.get("es1")).toBe("superseded");
  });

  it("excludes archived versions from the Active pick — the next-highest published becomes Active", () => {
    const rows = [
      row("v3", 3, "enUS", PUB, ARC),
      row("v2", 2, "enUS", PUB),
      row("v1", 1, "enUS", PUB),
    ];
    const statuses = deriveVersionStatuses(rows);
    expect(statuses.get("v3")).toBe("archived");
    expect(statuses.get("v2")).toBe("active");
    expect(statuses.get("v1")).toBe("superseded");
  });

  it("all-archived → every published row is Archived and NO row is Active", () => {
    const rows = [
      row("v2", 2, "enUS", PUB, ARC),
      row("v1", 1, "enUS", PUB, ARC),
    ];
    const statuses = deriveVersionStatuses(rows);
    expect(statuses.get("v2")).toBe("archived");
    expect(statuses.get("v1")).toBe("archived");
    expect(
      [...statuses.values()].filter((s) => s === "active"),
    ).toHaveLength(0);
  });

  it("a draft is never Active, even when it carries the highest versionNumber", () => {
    const rows = [
      row("v4", 4, "enUS", null),
      row("v3", 3, "enUS", PUB),
    ];
    const statuses = deriveVersionStatuses(rows);
    expect(statuses.get("v4")).toBe("draft");
    expect(statuses.get("v3")).toBe("active");
  });

  it("an archived flag on a DRAFT row is ignored — drafts stay Draft (publishedAt wins)", () => {
    // Defensive: the server never archives drafts (409 NOT_PUBLISHED), but the
    // derivation must not invent an "archived draft" state if data drifts.
    const rows = [row("v1", 1, "enUS", null, ARC)];
    expect(deriveVersionStatuses(rows).get("v1")).toBe("draft");
  });
});

describe("deriveVersionStatus — single-row convenience", () => {
  it("returns the same status the map derives", () => {
    const rows = [row("v2", 2, "enUS", PUB), row("v1", 1, "enUS", PUB)];
    expect(deriveVersionStatus(rows, "v2")).toBe("active");
    expect(deriveVersionStatus(rows, "v1")).toBe("superseded");
  });

  it("returns null for an unknown versionId", () => {
    expect(deriveVersionStatus([row("v1", 1, "enUS", PUB)], "nope")).toBeNull();
  });
});

describe("nextActiveVersionNumber — Wave ED8 roll-back confirm data", () => {
  it("returns the highest published non-archived sibling in the SAME language", () => {
    const rows = [
      row("v3", 3, "enUS", PUB),
      row("v2", 2, "enUS", PUB),
      row("v1", 1, "enUS", PUB),
    ];
    expect(nextActiveVersionNumber(rows, "v3")).toBe(2);
  });

  it("returns null when this is the only published non-archived version (the LAST_PUBLISHED_VERSION guard case)", () => {
    const rows = [row("v1", 1, "enUS", PUB)];
    expect(nextActiveVersionNumber(rows, "v1")).toBeNull();
  });

  it("skips archived siblings, drafts, and other languages", () => {
    const rows = [
      row("v4", 4, "enUS", PUB), // the row being rolled back
      row("v3", 3, "enUS", PUB, ARC), // archived — skipped
      row("d5", 5, "enUS", null), // draft — skipped
      row("es9", 9, "es", PUB), // other language — skipped
      row("v2", 2, "enUS", PUB), // ← the answer
    ];
    expect(nextActiveVersionNumber(rows, "v4")).toBe(2);
  });

  it("returns null for an unknown versionId", () => {
    expect(nextActiveVersionNumber([row("v1", 1, "enUS", PUB)], "nope")).toBeNull();
  });
});

describe("willBecomeActiveOnUnarchive — Wave ED8 unarchive confirm data (spec §5)", () => {
  it("true when the archived row's versionNumber exceeds the current Active's", () => {
    const rows = [
      row("v3", 3, "enUS", PUB, ARC),
      row("v2", 2, "enUS", PUB),
    ];
    expect(willBecomeActiveOnUnarchive(rows, "v3")).toBe(true);
  });

  it("false when a higher Active version exists — unarchiving lands it in Superseded", () => {
    const rows = [
      row("v1", 1, "enUS", PUB, ARC),
      row("v2", 2, "enUS", PUB),
    ];
    expect(willBecomeActiveOnUnarchive(rows, "v1")).toBe(false);
  });

  it("true when there is NO current Active for the language (everything else archived)", () => {
    const rows = [
      row("v1", 1, "enUS", PUB, ARC),
      row("v2", 2, "enUS", PUB, ARC),
    ];
    expect(willBecomeActiveOnUnarchive(rows, "v1")).toBe(true);
  });

  it("scopes the Active comparison to the row's OWN language", () => {
    const rows = [
      row("en1", 1, "enUS", PUB, ARC), // only enUS row → no enUS Active
      row("es9", 9, "es", PUB), // es Active must not suppress the enUS unarchive
    ];
    expect(willBecomeActiveOnUnarchive(rows, "en1")).toBe(true);
  });

  it("false for an unknown versionId", () => {
    expect(willBecomeActiveOnUnarchive([row("v1", 1, "enUS", PUB)], "nope")).toBe(
      false,
    );
  });
});
