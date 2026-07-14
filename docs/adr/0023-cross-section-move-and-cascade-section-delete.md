# ADR-0023 — Cross-section question move + cascade section-delete: structure-mutation policy

**Status:** Accepted (Wave ED5, 2026-07-14). Spec: [docs/specs/v7.6/19ag-editor-overhaul-wave5-polish.md](../specs/v7.6/19ag-editor-overhaul-wave5-polish.md). Extends [ADR-0020](0020-question-stablekeys-slug-derived-and-locked.md); relies on [ADR-0016](0016-per-respondent-longitudinal-scored-only-same-version-deltas.md).

## Context

Wave ED5 (the editor-overhaul close-out) gave the three-pane outline two new structural mutations that the earlier editor never allowed from a single surface: **moving a question to another section**, and **deleting a section that still has questions**. Both touch the section↔question relationship, which feeds report grouping and per-domain scoring — so their policy needs recording, because a future reader will reasonably ask "why is this allowed, and is it safe?"

ADR-0020 already established that a question's `stableKey` is the permanent cross-version join identity (trends, locked Esperto import crosswalks, peer benchmarks, conditional-followup keys), derived from its section prefix at first save then **immutable**; inherited questions (key present in a published version) have key + type **locked**, while order/structure edits are permitted **with a named-consequence warning** rather than blocked (version-pinning + ADR-0016 make the exposure interpretive, not data corruption).

## Decision

1. **Cross-section move is permitted, including for inherited questions, with a warning.**
   `moveQuestionToSection(uid, targetSectionKey, index?)` changes only `sectionStableKey` + `sortOrder`; it never touches `stableKey` or `showIf`. Because the join identity is the (immutable) `stableKey`, trends / crosswalks / benchmarks are unaffected. The server version-PATCH does not police `sectionStableKey`, so a move is not server-rejected. When the moved question is **inherited**, the editor shows a named-consequence confirm (`buildMoveQuestionPrompt`): the key keeps its **original-section prefix** (keys are immutable — a cosmetic mismatch, not a correctness issue), and from the **next published version** report grouping + per-domain scoring (`section.domain`) count it under the new section; **past published versions are unaffected** (ADR-0016 keeps computed deltas same-version-only). New-to-draft moves prompt nothing. This mirrors ADR-0020's "warn, don't block" stance for inherited structure edits.

2. **Show-if ordering stays permissive; the publish gate enforces it.** A move can reorder a gate relative to its dependents. Consistent with Wave W, the move is not blocked at author time; the existing publish gate (`checkShowIfIntegrity`: gate must be a strictly-earlier MULTI_CHOICE) rejects an out-of-order draft at publish.

3. **Deleting a non-empty section CASCADES (removes the section AND its questions), globally.** `deleteSection(uid)` is one atomic model operation that removes the section, physically deletes its questions, and clears the `showIf` of any **external** dependent (a question *outside* the section that gated on a deleted question — it becomes always-visible). A **strong aggregated confirm** (`buildSectionDeletePrompt`, fed by the shared `collectSectionDeleteImpact`) enumerates the inherited keys being deleted with the three Wave-T consequences (trend history ends · locked crosswalk refuses · peer benchmarks pruned) and names the freed external dependents. This replaces the previous behaviour, which **orphaned** the questions (left them with a dangling `sectionStableKey`). It is applied **globally** — both the three-pane outline and the legacy Sections tab route through the same command + prompt (no divergence; co-validate C2) — so it is a behaviour change on a flag-independent surface (kill = revert).

4. **Inherited removal is PHYSICAL, not a tombstone.** A cascaded (or single) delete removes the question from the draft outright; a later recreate under the same key becomes a new `_2`-suffix series (ADR-0020 §2), so trend history never silently resurrects. No soft-delete/tombstone is introduced.

5. **Defense-in-depth against corruption.** Beyond the atomic command, the **save serializer** fails closed (`ORPHAN_SECTION_REF`) and the **publish gate** independently rejects (`checkSectionRefsResolve`) any question whose non-empty `sectionStableKey` resolves to no section, and the publish gate rejects dangling `showIf` (`checkShowIfIntegrity`). A dangling show-if is deliberately **not** blocked at save (Wave W permits in-progress conditional authoring; publish is the boundary).

## Consequences

- Authors can reorganise instruments (move questions, delete sections) entirely from the Edit workspace without stranding data; the pre-cascade orphan bug is fixed everywhere.
- A moved inherited question's key prefix no longer matches its section — cosmetic; keys stay opaque join identifiers.
- Moving/deleting shifts report grouping + per-domain scoring **only from the next published version**; issued reports and past-version trends are immutable (ADR-0016).
- Cascade delete of inherited questions is a deliberate, warned, history-affecting act (same class ADR-0020 already governs for single inherited deletes).
- `CONTEXT.md` is untouched: outline / canvas / move / cascade are editor-UI mechanics, not domain vocabulary.

## Alternatives considered

- **Block moving inherited questions** — rejected: contradicts ADR-0020 (only key + type are locked) and blocks a legitimate authoring need.
- **Block cascade when the section holds inherited questions** (force one-by-one deletes) — rejected: friction without added safety given the strong aggregated confirm + the "warn, don't block" precedent.
- **Tombstone inherited deletions** — rejected: ADR-0020's suffix-on-recreate rule already prevents history resurrection; a tombstone adds model complexity for no benefit here.
