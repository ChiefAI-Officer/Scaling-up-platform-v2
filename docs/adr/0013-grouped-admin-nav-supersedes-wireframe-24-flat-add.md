# Grouped-dropdown admin nav supersedes Wireframe 24's flat-add top-nav model

- **Status:** Accepted (2026-06-22). Design grilled + user-approved (AskUserQuestion: grouped
  dropdowns; 5-slot domain taxonomy; click-to-open menu-only labels; pending-count badges).
  Implementation **gated** on a per-wave TDD plan + owner approval of the preview mockup (per the
  June-22 ask for "a preview before prod"). Full spec:
  [docs/specs/v7.6/17h-wave-h-admin-nav-design.md](../specs/v7.6/17h-wave-h-admin-nav-design.md).
  Relates to Wave-5 Wireframe 24
  ([docs/wireframes-phase2/wave5/24-platform-nav-assessments-entry.md](../wireframes-phase2/wave5/24-platform-nav-assessments-entry.md)).

## Context

The **wireframes-are-the-spec** discipline treats `docs/wireframes-phase2/` as the authoritative UI
contract; drift from a locked wireframe is a P0 to surface, never to silently extend. Wireframe 24
(locked May 15-17 2026, after a Jeff standing call + 3 Codex review rounds) specified the platform
nav as a **flat bar** with "Assessments" added as the 14th item between Surveys & Files, plus a
dedicated **assessments-lane sidebar** revealed on entering that section.

Two things then happened:
1. The flat bar **grew past the wireframe** — it is now **16 items** (Assessments, Registrations,
   Refunds, Emails were added since), overflowing on laptop widths (the bar `overflow-x-auto`
   horizontal-scrolls) with no domain grouping and no action signal on the operator queues.
2. On the **June 22 2026** call, Jeff asked for a **grouped/dropdown** nav — and a **preview before
   prod**. The grilled, user-approved direction is a 5-group taxonomy
   (`Dashboard | Workshops▾ | Assessments→ | Automation▾ | People▾ | Financials▾`).

This **contradicts WF24's flat-add model**. Left unrecorded, a future reader (or a wireframe-fidelity
pass) would see the grouped nav as drift from the locked wireframe and "restore" the flat bar — undoing
Jeff's explicit ask. The IA grouping is also costly to flip back and forth once operators learn it.
Hence an ADR: hard to reverse, surprising without context, and the result of a real trade-off.

## Decision

1. **Wireframe 24's *flat-add top-nav model* is superseded by grouped dropdowns.** The 16 flat items
   collapse into 5 domain groups (full mapping in Spec 17h §C). Two entries stay ungrouped direct links:
   **Dashboard** and **Approvals** — the latter promoted to a standalone top-level link in the June 26 2026
   owner preview review so its pending badge is always visible. Group labels are **menu-only** (open
   a dropdown; do not navigate); only leaf items and the two direct entries (`Dashboard`,
   `Assessments →`) navigate.

2. **Wireframe 24's *assessments-lane sidebar* is NOT superseded — it survives intact.** In the new
   taxonomy `Assessments →` is a **gateway link** (arrow, not a dropdown) into that lane, which keeps
   its own sidebar (`components/nav/assessments-sidebar.tsx` + `(dashboard)/admin/assessments/`
   sub-routes, all unchanged). Wave H changes **only the top-nav chrome**.

3. **Pending-count badges** on `Approvals` and `Refunds` leaves, sourced from existing queries
   (Spec 17h §E). A zero count renders no badge.

4. **Scope is the ADMIN/STAFF dashboard nav only.** No new routes, no schema migration, no feature
   flag, no per-item role gating, no change to the coach portal nav. Reversible by reverting the
   component/layout change.

## Consequences

- **Positive:** the nav stops overflowing; domains are legible; operator queues show a "needs
  action" count; the change is additive and revert-safe; WF24's lane work is preserved, not thrown away.
- **Negative / watch:** WF24's flat-bar mock is now **out of date** — this ADR (and Spec 17h §B) is
  the pointer that explains why; the wireframe HTML is left as historical record, not re-cut.
  CLAUDE.md's "Nav bar has N items" gotcha is updated on merge. A few leaf placements (Approvals,
  Surveys, Files) are judgment calls flagged for the preview review — moving one later is a one-line
  change to the nav model, not a structural redo.
- **Alternatives rejected:** (a) keep the flat bar and only shrink labels — doesn't address grouping
  or Jeff's ask; (b) re-cut Wireframe 24 to a grouped flat-bar first — slower, and the mockup +
  this ADR already serve as the design record the owner signs off on.
