/**
 * Wave ED10 (spec 19am-plan, T3) — editor tab routing behind the ed10Active
 * gate.
 *
 * PURE-LOGIC tests. These exercise the two exported pure helpers that the
 * TabbedShell component uses as its single source of truth for tab routing:
 *   - `editorTabConfig(activeAuthoringMode, ed10Active)` → { defaultTab,
 *     validTabIds } — the valid-id set + param-less default, both DERIVED
 *     from ed10Active.
 *   - `resolveEditorTab(param, activeAuthoringMode, ed10Active)` → TabId —
 *     maps the ?tab= URL param + mode signals to a resolved tab id.
 *
 * The golden `ed10-golden-snapshots` + frozen `editor-byte-equivalence` /
 * `three-pane-parity` suites pin the flag-OFF RENDER. This file pins the
 * routing LOGIC for BOTH flag states. Full flag-ON render is Task 10.
 *
 * ── The C5 trap ───────────────────────────────────────────────────────────
 * With the ED10 flag OFF, in forms mode (single-column), the param-less
 * default is Build (`questions`), NOT metadata. Forcing metadata as the
 * inactive default would regress ED9. The `inactive (forms mode)` block below
 * locks that: param-less → questions.
 */

import {
  editorTabConfig,
  resolveEditorTab,
} from "@/components/admin/template-editor/TabbedShell";

// ─────────────────────────────────────────────────────────────────────────
// editorTabConfig — valid-id set + default derive from ed10Active (D8/D11)
// ─────────────────────────────────────────────────────────────────────────
describe("editorTabConfig — active (ed10Active = true, single mode)", () => {
  const cfg = editorTabConfig("single", true);

  it("param-less default is Preview", () => {
    expect(cfg.defaultTab).toBe("preview");
  });

  it("valid ids are {preview, questions, scoring, settings, versions}", () => {
    expect([...cfg.validTabIds].sort()).toEqual(
      ["preview", "questions", "scoring", "settings", "versions"].sort(),
    );
  });

  it("metadata + sections are NOT valid ids when active", () => {
    expect(cfg.validTabIds).not.toContain("metadata");
    expect(cfg.validTabIds).not.toContain("sections");
  });
});

describe("editorTabConfig — inactive (ed10Active = false)", () => {
  it("forms mode (single): default stays Build/questions, legacy set unchanged", () => {
    const cfg = editorTabConfig("single", false);
    expect(cfg.defaultTab).toBe("questions");
    expect([...cfg.validTabIds].sort()).toEqual(
      ["metadata", "questions", "scoring", "sections", "versions"].sort(),
    );
    // preview/settings are NOT valid ids when inactive.
    expect(cfg.validTabIds).not.toContain("preview");
    expect(cfg.validTabIds).not.toContain("settings");
    // metadata is STILL a valid id when inactive.
    expect(cfg.validTabIds).toContain("metadata");
  });

  it("three-pane mode: default is questions (Edit)", () => {
    expect(editorTabConfig("three", false).defaultTab).toBe("questions");
  });

  it("legacy mode: default is metadata (byte-identical to today)", () => {
    expect(editorTabConfig("legacy", false).defaultTab).toBe("metadata");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// resolveEditorTab — ACTIVE (ed10Active = true; mode is always single here)
// ─────────────────────────────────────────────────────────────────────────
describe("resolveEditorTab — active (ed10Active = true, single mode)", () => {
  const r = (param: string | null) => resolveEditorTab(param, "single", true);

  it("param-less → preview", () => {
    expect(r(null)).toBe("preview");
  });

  it("?tab=metadata → settings (Metadata absorbed into Settings)", () => {
    expect(r("metadata")).toBe("settings");
  });

  it("?tab=questions → questions (Build)", () => {
    expect(r("questions")).toBe("questions");
  });

  it("?tab=sections → questions (ED6 fold preserved)", () => {
    expect(r("sections")).toBe("questions");
  });

  it("?tab=preview / ?tab=settings / ?tab=scoring / ?tab=versions pass through", () => {
    expect(r("preview")).toBe("preview");
    expect(r("settings")).toBe("settings");
    expect(r("scoring")).toBe("scoring");
    expect(r("versions")).toBe("versions");
  });

  it("unknown id → preview (default)", () => {
    expect(r("conditional")).toBe("preview");
    expect(r("garbage")).toBe("preview");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// resolveEditorTab — INACTIVE, forms mode (single, ed10Active = false)
//   The C5 trap lives here: Build must stay the param-less default.
// ─────────────────────────────────────────────────────────────────────────
describe("resolveEditorTab — inactive forms mode (single, ed10Active = false)", () => {
  const r = (param: string | null) => resolveEditorTab(param, "single", false);

  it("param-less → questions (Build preserved — C5)", () => {
    expect(r(null)).toBe("questions");
  });

  it("?tab=metadata → metadata (still a valid id when inactive)", () => {
    expect(r("metadata")).toBe("metadata");
  });

  it("?tab=preview → questions (preview is NOT valid → falls to Build default)", () => {
    expect(r("preview")).toBe("questions");
  });

  it("?tab=settings → questions (settings is NOT valid → falls to Build default)", () => {
    expect(r("settings")).toBe("questions");
  });

  it("?tab=sections → questions (ED6 fold)", () => {
    expect(r("sections")).toBe("questions");
  });

  it("?tab=questions → questions; unknown → questions", () => {
    expect(r("questions")).toBe("questions");
    expect(r("conditional")).toBe("questions");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// resolveEditorTab — INACTIVE, legacy + three (unchanged from today)
// ─────────────────────────────────────────────────────────────────────────
describe("resolveEditorTab — inactive legacy (ed10Active = false)", () => {
  const r = (param: string | null) => resolveEditorTab(param, "legacy", false);

  it("param-less → metadata", () => {
    expect(r(null)).toBe("metadata");
  });

  it("?tab=sections → sections (legacy keeps the Sections tab; no fold)", () => {
    expect(r("sections")).toBe("sections");
  });

  it("?tab=metadata → metadata", () => {
    expect(r("metadata")).toBe("metadata");
  });

  it("?tab=preview → metadata (preview not valid → default)", () => {
    expect(r("preview")).toBe("metadata");
  });
});

describe("resolveEditorTab — inactive three-pane (ed10Active = false)", () => {
  const r = (param: string | null) => resolveEditorTab(param, "three", false);

  it("param-less → questions (Edit is the workspace default)", () => {
    expect(r(null)).toBe("questions");
  });

  it("?tab=metadata → metadata (valid)", () => {
    expect(r("metadata")).toBe("metadata");
  });
});
