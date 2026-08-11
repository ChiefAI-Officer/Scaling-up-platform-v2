# July 10 #57 — LVA Peer Averages Settings Restore Implementation Plan

> **For agent execution:** Follow this plan task by task with test-first changes,
> verification before completion, and one narrow row-scoped pull request.

**Goal:** Move the existing LVA peer-average editor into the current Settings
tab and safely restore the capability on Production.

**Architecture:** The server page continues to resolve the Wave S flag, exact
LVA alias gate, eligible stable keys, labels, and stored values. It passes the
result through the editor controller/shell to `SettingsTab`, which owns the
panel's visual placement. The existing panel and PUT API remain unchanged.

**Tech stack:** Next.js App Router, React, TypeScript, Jest/Testing Library,
Prisma, Vercel.

---

## Task 1: Pin the approved Settings behavior with a failing test

- [x] Extend `src/src/__tests__/components/admin/template-editor/settings-tab.test.tsx`.
- [x] Assert supplied peer rows render inside Settings with the template id.
- [x] Assert omitted peer rows render no peer editor.
- [x] Run the focused test and observe the expected failure before production
      code changes.

## Task 2: Relocate the existing panel

- [x] Add the optional peer rows contract to `TabbedShellProps`.
- [x] Thread the rows from `TabbedShell` to `SettingsTab`.
- [x] Render `PeerBenchmarksPanel` in Settings after report appearance.
- [x] Pass rows from the server page to `TemplateEditorTabbed` and remove the
      trailing page-level mount.
- [x] Run the focused tests until green.

## Task 3: Record release boundaries

- [x] Add a newest-first CHANGELOG entry describing the UI correction,
      alias-only gate, and zero-persistent-data boundary.
- [x] Update the `CLAUDE.md` freshness anchor and brief status prose.
- [x] Keep ledger #57 PARTIAL until the feature is merged and verified live.

## Task 4: Verify and publish the narrow implementation

- [x] Run changed-file ESLint.
- [x] Run relevant targeted Jest suites.
- [x] Run migration safety.
- [x] Run the full Jest suite once.
- [x] Run the Production-equivalent Turbopack build.
- [ ] Run `git diff --check`, review against fixed point
      `1d4c0d7f295e8bea19ba0835fd45ae1a349794f1`, commit, push, and open one
      ready PR for row #57.

## Task 5: Production acceptance after merge

- [ ] Confirm the merged SHA is deployed and health is safe.
- [ ] Reactivate Wave S in Production.
- [ ] Confirm the LVA Settings panel visually.
- [ ] Use temporary values to prove individual and group comparison rendering.
- [ ] Capture PII-free evidence and immediately clear all temporary values.
- [ ] Confirm zero stored benchmark rows again.
- [ ] Close #57 through its own ledger/SoT update.
- [ ] Close #58 through a separate evidence-only ledger/SoT update.
