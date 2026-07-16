# 19ak — Wave ED8: Template Version Lifecycle (Roll back · Archive · Draft-delete)

**Status: DESIGN — user-approved 2026-07-16 (visual design review); pre-build.**
**Flag:** `WAVE_ED8_VERSION_LIFECYCLE_ENABLED` (+ `_KILL`) — gates the write endpoints + new UI only; archived-exclusion in read paths is persisted admin intent and is NEVER flag-gated (Wave-Q doctrine).
**Design SoT:** the approved-design Artifact (claude.ai/code/artifact/023014a6-05b2-4a6e-bd3d-27d41835569f) — "The approved design" section. Companion plan: `19ak-plan-wave8-version-lifecycle.md`.

## 1. Problem

Publishing is additive-only, so a template like Leadership Vision Alignment shows 3 identical "Published" badges with no notion of which version new campaigns use; there is no rollback, archive, or delete; the Versions tab shows a developer content-hash and "(you are here)"; and the Metadata tab's version strip labels EVERY published version "● Active" (wrong). The user's governing principle: the whole editor as simple as possible.

## 2. Approved model

> **"Published versions can be rolled back or archived — never deleted. Drafts can be deleted."**

Statuses, derived per (templateId, language) — **Active is DERIVED, never stored**:

| Status | Definition | Actions (≤2) |
|---|---|---|
| **Active** | highest `versionNumber` with `publishedAt != null AND archivedAt == null` | **Roll back…** · Duplicate |
| **Superseded** | published, non-archived, not the highest | Archive · Duplicate |
| **Draft** | `publishedAt == null` | Edit · Publish · Delete |
| **Archived** | published + `archivedAt != null`; collapsed behind "N archived — Show" | Unarchive · Duplicate |

- **Roll back = archive the Active version.** The previous published non-archived version becomes Active for NEW campaigns. Existing campaigns keep their pinned version — `publishedAt` is never modified, so pinned reads (submit scoring, reports) are untouched by construction. Rolled-back versions land in **Archived** (user-confirmed, not Superseded).
- **Guard:** cannot archive the LAST published non-archived version of its (template, language) — new campaigns would 422. Replaces the earlier draft's "active never archivable" guard.
- **No separate Restore** — Duplicate covers "start a draft from this version".
- Confirm copy (roll back): *"v3 will stop being used for new campaigns; v2 becomes Active. Campaigns already running keep v3."* Draft delete: *"Delete this draft? This cannot be undone."*
- UI: VersionsTab is the single lifecycle surface — columns Version | Language | Status | Published (date) | Actions; content-hash column and "(you are here)" removed; archived collapse row. MetadataTab `VersionHistoryStrip` removed when flag ON (its all-"● Active" labels are wrong — fixed by removal). TabbedShell pill: `v3 (active)` / `v2 (superseded)` / `v4 (draft)`; `publishedSibling` memo becomes language-scoped.

## 3. Schema + trigger (co-validate C1 — BLOCKER found by Codex)

Additive `archivedAt DateTime?` on `AssessmentTemplateVersion` (no index — grouping is client-side). `publishedAt` semantics unchanged.

**The v7.5 immutability trigger must be replaced in the same migration**: migration `20260514230000` (L495) installed a Postgres trigger that rejects ANY `UPDATE`/`DELETE` where `OLD."publishedAt" IS NOT NULL` — archive/unarchive are updates to published rows and would fail at the DB. The new migration uses `CREATE OR REPLACE FUNCTION` (no destructive DDL keywords — passes the Migration Safety Gate) to allow updates that change ONLY `archivedAt` on published rows, while continuing to block published-row deletes and any content/scoring/`publishedAt` mutation. Verified by a read-only test asserting the new function body via `pg_get_functiondef` (or an equivalent behavior test at the route seam if no live DB in CI).

## 4. Active resolution — one definition

New `src/src/lib/assessments/active-version.ts`: `activePublishedWhere = { publishedAt: { not: null }, archivedAt: null }` + `resolveActiveVersion(db, templateId, language)` (`versionNumber desc`). Every must-exclude reader spreads/calls this — Active is defined in exactly one place.

### Read-path classification (verified, file:line in 19ak-plan)

| Reader | Classification |
|---|---|
| `resolvePublishedTemplateVersion` (campaign create) | **EXCLUDE archived** (definitional) |
| trends latest-version selection | **EXCLUDE at selection** (loader keeps all published rows for excluded-campaign bookkeeping) |
| Import resolvers (both routes + esperto helper) | **EXCLUDE** |
| `version-sections` (new-campaign sections) | **EXCLUDE** |
| Benchmarks editor rows — BOTH the API route AND the edit page's own server-side latest-published query (edit/page.tsx ~L126; co-validate C3) | **EXCLUDE** (peers currently killed; classified anyway) |
| Wave-T inherited-lock unions (PATCH + edit page) | **INCLUDE — must not change** (identity locks against ALL history; pinned by regression test) |
| GET `/versions` aggregate-dashboard list | **INCLUDE (unaffected)** — archived versions' historical submissions stay reachable |
| Quiz submit / group report (pinned by campaign FK) | Unaffected |
| `[id]/page.tsx` redirect, `[id]` versions display list, dashboard-stats | Unaffected (display list gains `archivedAt` in select) |

## 5. Endpoints

One new route file `versions/[versionId]/archive/route.ts` — **POST = archive** (serves BOTH "Roll back" and "Archive"; the distinction is UI label + confirm copy only), **DELETE = unarchive**. Plus a **draft-only DELETE** added to the existing `versions/[versionId]/route.ts`.

Guard chain (house): `withRateLimit → getApiActor → isPrivilegedRole → flag→404`. Codes: archive POST → 409 `NOT_PUBLISHED` / `ALREADY_ARCHIVED` / `LAST_PUBLISHED_VERSION`; unarchive DELETE → 409 `NOT_ARCHIVED`; draft DELETE → 409 `ALREADY_PUBLISHED` + preflight campaign count / catch Prisma `P2003` → 409 `VERSION_IN_USE` (co-validate C5 — clean handling instead of a raw FK failure). Audit: `TEMPLATE_VERSION_ARCHIVED` / `TEMPLATE_VERSION_UNARCHIVED` / `TEMPLATE_VERSION_DELETED` (AuditAction union extended).

**Race hardening (co-validate C2 — BLOCKER; matches own review):** a plain `$transaction` under default isolation does NOT prevent two concurrent archives of the last two published versions from both passing the sibling count. The archive transaction runs with `isolationLevel: 'Serializable'` + one retry on serialization failure (alternative: a per-(templateId,language) advisory lock). Covered by a concurrent-archive test.

**Language centralization (co-validate C4 — HIGH):** `version-sections` defaults to `"en"` while campaign-create defaults to `"enUS"` — with Active derived per language these can resolve DIFFERENT rows and break `expectedVersionId`. The default-language constant is centralized (exported beside `resolveActiveVersion`) and both paths call the same resolver.

**Unarchive consequence (own review):** unarchiving a version numbered higher than the current Active makes it Active again instantly (derived). The unarchive confirm states this when applicable: "v3 will become the Active version again."

**Post-rollback landing (own review):** the `[id]/page.tsx` redirect prefers the highest NON-ARCHIVED version (draft or active); falls back to the overall max only when everything is archived.

## 6. Kill semantics

Flag/kill off → archive/unarchive/delete endpoints 404 and the legacy VersionsTab renders (archived rows appear as plain "Published" — it inspects only `publishedAt`, byte-identity automatic). **Archived-exclusion in campaign-create and other read paths stays in force** — a kill stops further lifecycle operations; it never un-retires a version (persisted admin intent).

## 7. Testing

Seams per the approved review: (a) component-render (VersionsTab flag-ON statuses/verbs/collapse/multi-language + flag-OFF byte-identity; MetadataTab strip pins flag-OFF), (b) route-handler harness (all guards, flag-off 404s, audit payloads, per-language last-published guard), (c) post-launch live-app e2e walk. Plus: `active-version` helper unit tests (multi-language, archived exclusion, none-left) and the **lock-union regression pin** (an archived version's stableKeys still lock — `KEY_COLLIDES_WITH_PUBLISHED`/`TYPE_LOCKED`).

Co-validate additions (C7 + own): trigger allow-list verification · concurrent-archive race test · edit-page benchmark archived-exclusion · version-sections/campaign-create language parity · draft-delete FK conflict (`VERSION_IN_USE`) · unarchive-a-higher-version re-derives Active for new campaign resolution · redirect-prefers-non-archived.

## 8. Risks (accepted/mitigated)

- Active-definition drift (campaign-create `versionNumber desc` vs trends `publishedAt desc`) — helper canonicalizes campaign-create's; trends only gains the archived filter. Documented in the helper.
- Aggregate-dashboard default may select an archived version (most-recent data) — accepted, documented.
- Guard race on concurrent archive — Serializable transaction + retry (co-validate C2).
- Flag-off regressions — existing byte-identity suites.
- **Product consequence (documented, own review):** excluding archived from trends' latest-version anchor means a rollback also rolls the TRENDS series back to the previous version's campaigns — intended (a retired instrument's data shouldn't anchor trends), but stated here so nobody reads it as a bug.

## 8b. Co-validate record (2026-07-16)

Real Codex (CLI `codex exec`, gpt-5.5 @ xhigh, read-only; the MCP wrapper timed out) — verdict NEEDS-CHANGES, all findings ACCEPTED and folded: C1 trigger BLOCKER (§3) · C2 race BLOCKER (§5) · C3 edit-page benchmark reader (§4) · C4 language parity (§5) · C5 draft-delete FK handling (§5) · C6 esperto helper path corrected in 19ak-plan · C7 test additions (§7). Own independent review (4 findings, all folded): race (=C2) · post-rollback redirect · unarchive confirm copy · trends consequence documentation. Nothing overridden.

## 9. Out of scope

Preview/Settings tab rebuild (own wave; absorbs the old Metadata copy fixes) · ED9 Build-tab Forms pass · "Make active" sugar on Superseded rows (roll back steps one at a time; Duplicate→Publish covers jumps) · version-level hard-delete for published rows (never).
