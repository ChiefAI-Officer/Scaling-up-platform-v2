# 19ak-plan — Wave ED8 implementation plan (TDD)

Companion to `19ak-editor-wave8-version-lifecycle.md`. Rev. 2026-07-16-b (post-co-validate: real Codex NEEDS-CHANGES verdict folded — see spec §8b; supersedes both the pre-review draft that forbade archiving the active version AND the pre-co-validate rev).

**Co-validate deltas absorbed below:** T1 gains the v7.5 immutability-trigger replacement (C1 BLOCKER — migration `20260514230000` L495 blocks ALL updates to published rows; `CREATE OR REPLACE FUNCTION` to allow archivedAt-only changes) + verification test. T3 gains the edit-page benchmark reader (edit/page.tsx ~L126, C3) + the centralized default-language constant shared by version-sections (`"en"` today) and campaign-create (`"enUS"` today) (C4). T5: archive transaction `isolationLevel: 'Serializable'` + retry (C2) + draft-delete campaign-count preflight / `P2003` → 409 `VERSION_IN_USE` (C5). T7: `[id]/page.tsx` redirect prefers highest non-archived; unarchive confirm copy states re-activation. T8 gains the C7 test list. Esperto helper path corrected: `src/src/lib/assessments/esperto-import/restricted-route-helpers.ts` L196 (C6).

## Read-path evidence (classification in 19ak §4)

- `resolvePublishedTemplateVersion` — `src/src/lib/assessments/campaign-create-service.ts` L64-79 (where L68) → spread `activePublishedWhere`; 422 `TEMPLATE_VERSION_NOT_PUBLISHED` preserved when all archived.
- trends — `src/src/lib/assessments/trends.ts` loader L318-319 / `selectLatestVersion` L276-292: keep loading all published rows (excluded-campaign bookkeeping), filter `archivedAt` at selection; add `archivedAt` to the select (~L325).
- Imports — `src/src/app/api/admin/assessments/import/route.ts` L503-504; `src/src/app/api/assessments/import/route.ts` L501-502; `src/src/lib/assessments/esperto/restricted-route-helpers.ts` L196-206 → EXCLUDE.
- `version-sections/route.ts` L58-60 → EXCLUDE.
- Benchmarks — `[id]/benchmarks/route.ts` L117-118 (pure `listRatingQuestionKeys` in peer-benchmarks.ts L94 has no DB) → EXCLUDE at the route query.
- Wave-T lock unions — PATCH `versions/[versionId]/route.ts` L343-345 + edit page `computePublishedQuestionUnions` L100-117: filter stays `publishedAt: { not: null }` ONLY (INCLUDE archived) + "do not filter archivedAt here" comments + regression pin.
- Aggregate versions list — `versions/route.ts` L43-50, consumed by `AssessmentsAggregateReport.tsx` L16/L177 → unchanged (INCLUDE).
- Unaffected (pinned/display): submit `submit/route.ts` L170-173; group-report.ts L434; `[id]/page.tsx` L43-45 redirect; `[id]/route.ts` L57-64 display list (**gains `archivedAt` in select**); dashboard-stats.ts L47 (correct under the last-published guard).

## Tasks (red → green each)

1. **T1 Schema + flag.** `archivedAt DateTime?` on AssessmentTemplateVersion (schema L1243-1263) + additive migration. New `src/src/lib/assessments/wave-ed8-flags.ts` (`isVersionLifecycleEnabled()` = ENABLED && !KILL; doctrine comment: exclusion is persisted intent, never gated). Flag unit test.
2. **T2 Shared helper.** `src/src/lib/assessments/active-version.ts`: `activePublishedWhere` + `resolveActiveVersion(db, templateId, language)` (`versionNumber desc`). Unit tests: multi-language derivation, archived exclusion, none-left → null.
3. **T3 Read-path changes** (tests first per file): campaign-create (archived-active falls through to previous published; all-archived → 422), both import routes, esperto helper, version-sections, benchmarks route; trends selection filter (archived-latest skipped; excluded-campaign bookkeeping intact).
4. **T4 Lock-union regression pins.** Extend `template-version-patch.wave-t.test.ts`: an ARCHIVED version's stableKeys/types still yield `KEY_COLLIDES_WITH_PUBLISHED`/`TYPE_LOCKED`. Comments at PATCH L343-345 + edit page L102-105.
5. **T5 Endpoints.** New `versions/[versionId]/archive/route.ts` (POST archive / DELETE unarchive) + draft DELETE on `versions/[versionId]/route.ts`. Guards per 19ak §5; archive POST guard+update inside `$transaction`. AuditAction union + payloads. Route tests via the `versions-edit-duplicate.test.ts` harness: 401/403/flag-off-404/404-mismatch/each 409/success/idempotence-not-allowed (`ALREADY_ARCHIVED`/`NOT_ARCHIVED` are explicit 409s)/audit; per-language last-published guard (en-US archive blocked when it's the last EN even if an es-ES published exists).
6. **T6 Hook.** `useVersionActions.ts`: `handleArchiveVersion(versionId, { isActive })` (confirm copy per 19ak §2), `handleUnarchiveVersion`, `handleDeleteVersion` (post-delete: if deleting the OPEN version, `window.location.href = /admin/assessments/templates/{id}`); toast + `router.refresh()` + in-flight ids. Hook tests.
7. **T7 UI.** Server boolean `versionLifecycleEnabled={isVersionLifecycleEnabled()}` threaded edit page (~L192) → `TabbedShellProps` → VersionsTab/MetadataTab. Selects gain `archivedAt` (edit page allVersions; `[id]/route.ts`). `VersionRow` gains `archivedAt`. Flag ON: pure status-derivation helper (per language) + new table (columns Version | Language | Status | Published | Actions; hash col L129-131 and "(you are here)" L110-114 removed; ≤2 actions per verbs table; archived collapse). MetadataTab: skip `VersionHistoryStrip` when ON. TabbedShell: language-scoped `publishedSibling` (L474-481) + pill wording (L505-516).
8. **T8 UI tests.** VersionsTab flag-ON (badge assignment incl. multi-language: EN v3 active while ES v2 also active; verbs per status; collapse toggle; Roll back label on active) + flag-OFF byte-identity (existing suite passes unchanged); MetadataTab flag-ON absence + flag-OFF pins (L393-394 testids); TabbedShell pill tests.

Gate: editor + touched API suites green; frozen ED3 guard + ED4 parity zero-diff; `npx eslint` on changed files; `CI=true npx next build --turbopack`; jest-verified counts. Then adversarial review, PR, launch walk (flag flip + live verify per house §5.5-style quarantine if walk data is created).

**Size:** ~10 prod files touched, 3 new (flags, helper, archive route), 1 migration; ~450 prod LOC + ~700 test LOC.
