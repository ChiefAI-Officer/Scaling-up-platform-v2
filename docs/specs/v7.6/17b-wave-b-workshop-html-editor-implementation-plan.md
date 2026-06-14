# Wave B — Per-Workshop Landing-Page HTML Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let admin/staff edit an individual workshop's landing-page **custom HTML** (Jeff's "on workshops" ask), surfacing the brought-across resolved HTML in the per-workshop editor, with sanitize-on-write, an audit trail, a one-click restore, and the clone-route security hole closed.

**Architecture:** Re-open the deliberately-blocked `customHtml` write on the per-workshop `PUT /api/workshops/[id]/landing-pages/[template]` route — **admin/staff-only** (mirroring the existing `customCode` rule), sanitized on write via the existing `sanitizeCustomHtml` + a post-interpolation strict re-sanitize, with the prior body persisted **in the same transaction** for restore. A shared landing-page variable builder enriches `{{registration_url}}` (the auto-build two-pass) so admin-typed tokens resolve. The editor pages (`solo-landing`, `duo-landing`) gain an admin-only HTML textarea pre-filled with the resolved this-workshop HTML (a new privileged resolved-fallback endpoint supplies it when no row exists). The coach-accessible **library clone** route is fixed to never copy `customHtml` for non-privileged actors.

**Tech Stack:** Next.js (App Router, Turbopack) · TypeScript · Prisma · DOMPurify (`sanitize-custom-html.ts`) · Jest + RTL.

**Conventions:**
- Commands from `/Users/diushianstand/Scaling-up-platform-v2/src`. Build gate `CI=true npx next build --turbopack`.
- Branch: `feat/wave-b-workshop-html` (off `main`).
- **ZERO migration** (Q1) — no `schema.prisma` change, no migration file, no migration-safety-gate step. The prior body lives in an existing `AuditLog.changes` row. NO destructive ops, NO `migrate reset/dev`.
- Scoped to Wave B. Do NOT touch Wave A (separate branch/PR).
- **Rollout flag (Q9 / R3-HIGH-1):** the whole feature ships behind a **default-OFF** env gate `WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED` (mirrors Wave A's `ASSESSMENT_INVITE_BRANDED` kill-switch pattern), enforced by BOTH the UI and the server write/restore/resolved endpoints. Launch is a separate confirmed flip — merging Wave B changes nothing live.

**Authoritative spec:** `docs/specs/v7.6/17-jeff-june9-feedback-punchlist.md` — "Wave B" + the "Codex review — accepted hardening" (Wave B items) + "Security pass" subsections. Read those before starting.

---

## Grill revisions (pre-execution — these SUPERSEDE the tasks below where noted)

- **Q1 (migration) — DECIDED: no migration.** Do NOT add `LandingPage.customHtmlPrevious`. The build script auto-applies migrations (`prisma migrate deploy`) against the configured `DATABASE_URL`, and the local `.env` DB-target has a known mismatch history (PLAN.md HIGH) — so a new migration makes even local build-gate runs schema-mutating. Instead, store the prior body durably by writing it into a revision/audit row **inside the same `db.$transaction`** as the `customHtml` update (NOT via the failure-swallowing `logAudit`). Restore reads the latest such row. **Concrete store (verified):** `AuditLog.changes` is a bare `String` → Postgres `text` (unbounded), so the prior body fits with no schema change. **EVERY customHtml write — save AND restore — uses the SAME action `UPDATE_CUSTOM_HTML`** (R1-MED-2: a distinct `RESTORE_CUSTOM_HTML` action would make a restore invisible to the next restore's lookup → restore-of-restore broken). The user-facing operation type goes INSIDE the JSON: `tx.auditLog.create({ entityType: "LandingPage", entityId: landingPage.id, action: "UPDATE_CUSTOM_HTML", performedBy: actor.email, changes: JSON.stringify({ op: "save" | "restore", template, previousCustomHtml, newCustomHtmlLength }) })`. Restore reads `tx.auditLog.findFirst({ where: { entityType: "LandingPage", entityId: landingPage.id, action: "UPDATE_CUSTOM_HTML" }, orderBy: { timestamp: "desc" } })` → `JSON.parse(changes).previousCustomHtml` (scoped by `entityId` ⇒ satisfies Q7 entity-binding; served by the existing `@@index([entityType, entityId])`). So save→restore→restore works (every prior body is discoverable regardless of how it was created). **Effect:** the old migration task is REMOVED (no schema/migration); **Task 2's** save transaction writes the prior-body audit row; **Task 3's** restore reads it from there. Wave B is now **zero-migration**. Trade-off accepted: prior HTML (≤ `CUSTOM_HTML_MAX_LENGTH`) lives in the row's JSON, not a lean column (dedicated revision table deferred).

- **Q2 (write-surface enumeration) — RESOLVED in code.** The only runtime `LandingPage.customHtml` writers are (1) the per-workshop PUT route `app/api/workshops/[id]/landing-pages/[template]/route.ts` (the one we're opening — admin/staff-only) and (2) the clone route `app/api/landing-pages/library/route.ts` (coach-reachable — copies `customHtml` from a source page). Auto-build sources customHtml from the admin `PageTemplate`, not from request bodies. The 2 remaining touch points are manual CLI scripts. **Effect:** both runtime writers are in Wave B scope; the clone route's coach-reachable copy is the **authz-bypass to close** (the security pass flagged it). **Final policy (R1-HIGH-2 → R2-HIGH-1): the clone route must NOT write `customHtml` at all** — omit it from both branches. (a) It must not COPY the source body: Q4 stores `customHtml` resolved (values baked in), so `interpolateContentForHtml(sourcePage.customHtml, targetVars)` is a no-op that would leak the SOURCE workshop's coach/URL onto the target (R1-HIGH-2). (b) It must not CLEAR an existing target to `null` either: that is itself an unaudited customHtml write, letting a coach clone/retry erase an admin-authored override outside the admin-only CAS/audit/restore path (R2-HIGH-1). So: create branch omits `customHtml` (defaults `null`); update branch omits it (existing value untouched). The target's HTML is (re)generated in the editor (Task 5/Task 3, from the target's own active `PageTemplate.customHtml`) through the admin-only path. No hidden writer exists.

- **Q3 (CSS-`url()`/`@import` gap) — DECIDED: (A) document as an accepted admin-trust boundary; do NOT build CSS-URL validation in Wave B.** Confirmed gap: the sanitizer is `sanitize-html` (forced by a Vercel CJS incompatibility with jsdom, not chosen), with `parseStyleAttributes: false` (inline `style` passes verbatim) and `allowVulnerableTags: true` (`<style>` allowed); `TOKEN_RE` guards only `href`/`src`, not `url()`/`@import`. So CSS-based exfiltration/tracking survives both passes. **Why deferred:** (1) the write path is admin/staff-only — an admin embedding a tracking pixel in their own HTML is not privilege escalation; (2) the only path that makes an *untrusted* author reach it is the clone-route bypass, which Wave B **already closes** (Q2) — so the airtight gate is the real control; (3) the sanitizer is **shared with the already-shipped TEMPLATE-02** (`PageTemplate.customHtml`), so adding `url()`/`@import` allowlisting now would silently change prod behavior and risk regressing legitimate `background-image: url(...)` usage. **Effect:** add a one-line "admin-trusted; CSS `url()`/`@import` not scheme-validated" note to 17b's security section + a comment at the `parseStyleAttributes: false` site; CSS-URL allowlisting becomes a separate hardening item, triggered only if customHtml ever becomes coach-writable. Belt-and-suspenders deferred, not denied.

- **Q4 (storage model) — DECIDED: (A) resolved frozen snapshot.** Per-workshop `LandingPage.customHtml` stores HTML with workshop values already interpolated in, exactly as shipped TEMPLATE-02 does. The public render path `app/(public)/workshop/[slug]/page.tsx` stays the **pure trusted echo** it is today (lines ~156-163) — **zero render-path change**. The two-pass `interpolateContentForHtml` → `sanitizeCustomHtml(allowTokenUris:false)` pipeline runs at **save** time (in the PUT route), not at render. Rejected (B) raw-token-at-render: it would change a live prod render path and require distinguishing token-bearing rows from already-resolved ones, for a marginal staleness gain on a surface an admin is hand-editing per-workshop anyway. **Effect:** consequence — the snapshot does NOT auto-track later workshop-data changes; staleness is mitigated by the explicit "Refresh from current workshop data" action (see Q5). Editor must show a "static snapshot — does not auto-update when workshop details change" notice.

- **Q5 (non-destructive Refresh) — DECIDED: both recommendations.**
  - **5a — Safety:** "Refresh from current workshop data" is **confirm-gated + draft-only**. It shows a confirm dialog ("This replaces the editor with a fresh copy built from the latest workshop details. Your current edits will be lost. Continue?") and writes **only to the textarea (client state)** — it never touches the DB. The **only** persisting path is the normal **Save** (PUT), which always runs `interpolateContentForHtml` → `sanitizeCustomHtml(allowTokenUris:false)` + the Q6 CAS check. Safety properties: a mis-click loses only unsaved textarea content (reload restores the last save); and because Save is the sole writer and always sanitizes, **Refresh can never persist unsanitized state** — closing the security-pass "refresh reintroduces unsanitized state" concern structurally, not by trusting refresh output.
  - **5b — Regenerate source:** Refresh regenerates from the **active global `PageTemplate.customHtml` for that pageType**, interpolated with **current** workshop vars via the shared `buildEnrichedLandingPageVariables(workshopId)` generator — the SAME generator that pre-fills an empty editor, so pre-fill and refresh cannot drift. Pre-fill precedence: existing non-empty `LandingPage.customHtml` → else resolved-from-active-template → else empty. If **no** active template `customHtml` exists for that pageType, Refresh is **disabled** with a note ("no source template to refresh from"), not a garbage generation. SOLO_LANDING already has the active Kajabi template (PR #42).

- **Q6 (concurrency / lost-update) — DECIDED: both recommendations.** Grounding fact: the PUT is today a *full-form save* (rewrites `content`+`status`+`publishedAt` every call; `updatedAt` set manually to `new Date()`; `customCode` opt-in).
  - **6a — Column-scoped write:** the admin customHtml save writes **only `customHtml`** (+ the Q1 prior-body row + audit), never `content`/`status`. Implement by making **both `customHtml` and `content` opt-in** in the existing PUT, mirroring the `customCode !== undefined` pattern: write `content` only when provided (`...(content !== undefined ? { content: JSON.stringify(content) } : {})`), and `customHtml` only when provided AND actor is privileged. Coach editor (sends `content`, no `customHtml`) → writes content only, unchanged. Admin editor (sends `{ customHtml, expectedCustomHtml }`, no `content`) → writes customHtml only. **Effect:** admin-vs-coach writes are disjoint columns → zero cross-actor clobbering, no new endpoint.
  - **6b — CAS for admin-vs-admin (REVISED by R2-MED-2 — value-compare, not `updatedAt`):** the editor echoes back the **prior `customHtml` value it loaded** as `expectedCustomHtml` (a string, or `null` if the page had no override); the conditional update is `db.landingPage.updateMany({ where: { id, customHtml: expectedCustomHtml }, data })`. `count === 0` → **409 Conflict** (someone changed customHtml since load), return current server state; editor shows "This page changed since you opened it — reload, then re-apply." **Why not `updatedAt`:** the route sets `updatedAt: new Date()` at millisecond precision, so two same-millisecond writes (or a rapid retry) can leave `updatedAt` unchanged and let a stale write pass — a real lost-update. Comparing the exact prior `customHtml` value is precise (ms-immune) AND eliminates the false-409 a content-save would otherwise trigger. Field-present-but-null is a valid loaded state, so on an existing-row customHtml save the `expectedCustomHtml` field must be **present** in the body (its value may be `null`). **Effect:** the CAS `where` lives inside the same `db.$transaction` as the prior-body row write (Q1), so prior-body + customHtml update + audit are atomic and all gated by the value-compare `where`.

- **Q7 (restore entity-binding & semantics) — DECIDED: restore-as-a-Save.** The "undo my last customHtml change" restore is structurally identical to a manual save, funneling through the same path so all three security-pass risks (cross-workshop, wrong actor, stale/malicious body) collapse:
  - **Same admin/staff-only gate** as the PUT customHtml write (closes "wrong actor").
  - **Entity-binding:** the revision-row lookup is **scoped to `{ workshopId, template }`** — the row must belong to *this* workshop's *this* landing page; never restorable by raw row-id alone (closes "cross-workshop").
  - **Re-sanitize on restore:** re-run `sanitizeCustomHtml(allowTokenUris:false)` on the stored body before persisting — never trust the snapshot blindly, in case sanitizer rules tightened since (closes "stale/malicious body").
  - **No re-interpolation:** restore returns *exactly what you had* (the prior resolved body, values baked in per Q4). Fresh workshop data = Refresh (Q5), not Restore — kept cleanly separate.
  - **Same CAS + transaction:** restore carries `expectedCustomHtml` (the value-compare CAS token; 409 on conflict) and, being a customHtml write, **snapshots the pre-restore body into a new revision row inside the same `db.$transaction`** → restore is itself undoable; the "every customHtml change snapshots the prior body" invariant holds with no special-casing.
  - **Scope:** **single-level undo** ("Restore previous version") for v1. The data model accumulates full revision history (every save snapshots); the UI exposes one level only; multi-level version-browser deferred.

- **Q8 (publish lifecycle — /grill-me catch) — DECIDED.** Grounding: the public render only shows customHtml when `landingPage.status === "PUBLISHED"` (`(public)/workshop/[slug]/page.tsx` early-returns otherwise), and the original PUT does `publishedAt: status === "PUBLISHED" ? new Date() : existing.publishedAt`.
  - **Column-scoped (extends Q6):** a customHtml save must **NOT** change `status`/`publishedAt`. Editing HTML never silently (un)publishes. The admin omits `status` → neither field is touched.
  - **No regression on the status path:** preserve the original publish logic for requests that carry `status` — `...(status !== undefined ? { status, publishedAt: status === "PUBLISHED" ? new Date() : existing.publishedAt } : {})`. (The first reconcile draft dropped `publishedAt`; Task 2 restores it.)
  - **Editor UX guard (Task 5):** show the page's current publish state; when DRAFT, hint "This page is a draft — your HTML won't be public until the page is published." Do NOT add a publish button to the HTML editor — publishing stays in its existing flow.

- **Q9 (ops, rollout & observability — round-3 Ops/SRE review) — DECIDED.** Scoped to the admin-only, flag-gated nature; full detail in **Task 7**.
  - **R3-HIGH-1 kill-switch + canary:** ship behind `WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED` (default OFF), enforced by the UI **and** the server write/restore/resolved endpoints (off ⇒ write/restore/resolved return 403/404; the editor is hidden; **existing customHtml still renders** — the flag gates the editor/writer, not the public render). Optional allowlist (actor/workshop/category) for canary. A bad save persists in data and survives a code rollback, so a runtime gate — not just a deploy — is the control.
  - **R3-HIGH-2 bulk rollback runbook/script:** a **dry-run-first** ops script that enumerates `UPDATE_CUSTOM_HTML` audit rows by deployment-window/actor/workshop, restores each `previousCustomHtml` with the **value-compare CAS** (skip + record rows whose current value already diverged), and writes a summary audit row. Lets an operator revert a bad sanitizer/interpolation deploy across all touched pages while preserving later legitimate edits.
  - **R3-MED-1 observability:** the audit `changes` JSON carries structured metadata — `{ op, template, actorRole, prevSha, newSha, sanitizerStripped, status }`; add DB-derived dashboard counts (save/restore volume, 403/409 rates, sanitizer-strip count, cap rejects, resolved-fallback failures, **# public pages currently rendering customHtml**) + alert thresholds on error/conflict/strip spikes (fits the existing spec-06 `/admin/observability` pattern).
  - **R3-MED-2 version-skew capability contract:** the normal GET and the resolved endpoint return a capability marker (e.g. `customHtmlEditor: true` only when the flag is on AND the server supports the shape); the client **hides/disables the editor unless the marker is present** (fail-closed). Mixed-version tests: old-server response (no marker), missing `customHtmlResolved`, missing `customHtmlSaved`.
  - **R3-MED-3 audit-growth control:** storing full prior bodies is needed for restore but unbounded; mitigate with a **per-actor/workshop rate limit** on customHtml saves (`withRateLimit`) + a retention policy that prunes full prior-body text **older than the latest-per-page** beyond N days (keeping the SHA in metadata; restore is single-level — Q7 — so only the latest prior body must stay hot) + an audit-growth monitor. v1 may ship the rate limit + documented retention and defer automated pruning.

## File structure

> **ZERO MIGRATION** (Q1): no `schema.prisma` change, no migration file. The prior-body store is the existing `AuditLog.changes` `text` column (verified unbounded). The old "Task 1 — migration" is REMOVED; tasks are renumbered 1–6.

| File | Responsibility |
|------|----------------|
| `src/src/lib/templates/landing-page-variables.ts` (NEW) | `buildEnrichedLandingPageVariables(workshopId)` — `buildWorkshopVariables` + the auto-build `registration_url` enrichment (resolve the REGISTRATION page slug → absolute URL). Shared by the PUT save, the resolved-fallback endpoint, the clone re-interpolation, and (optionally) refactored auto-build. |
| `src/src/app/api/workshops/[id]/landing-pages/[template]/route.ts` (MODIFY) | PUT accepts `customHtml` (admin/staff-only, mirror `customCode`); **column-scoped write** (`content` opt-in — Q6); **mode-exclusive** body (R2-MED-1); interpolate (enriched) + strict-sanitize + **post-interpolation length cap** (R2-MED-3); **value-compare CAS** on `expectedCustomHtml` (Q6 / R2-MED-2 — NOT `updatedAt`); persist prior body into an `AuditLog.changes` row (structured metadata, R3-MED-1) + audit in one `db.$transaction` (Q1); **flag-gated** + rate-limited (Q9). New privileged GET `resolved` mode returns the pre-fill/refresh source HTML + capability marker (Q5/Q9). New admin-only restore action (Q7). |
| `src/src/app/api/landing-pages/library/route.ts` (MODIFY) | Clone **omits `customHtml`** from both the create and update writes — never copies the source body (R1-HIGH-2) and never clears an existing target's override (R2-HIGH-1). Not a customHtml writer. |
| `src/src/app/(dashboard)/workshops/[id]/landing-pages/solo-landing/page.tsx` + `duo-landing/page.tsx` (MODIFY) | Admin-only `customHtml` textarea, pre-filled with resolved HTML; "non-empty overrides block layout" + "static snapshot" notices; **confirm-gated, draft-only** "Refresh from current workshop data" action (Q5); "Restore previous version" (Q7); clearing reverts. Send `expectedCustomHtml` (the prior body the editor loaded) with customHtml saves; omit `customHtml` from the payload for non-privileged users. |
| `…/landing-pages/[template]/route.ts` — **route-local** `updateLandingPageBodySchema` (R1-LOW-1; NOT `lib/validations.ts`) | Extend with optional `customHtml: z.string().max(CUSTOM_HTML_MAX_LENGTH).nullable().optional()` + optional `expectedCustomHtml` (value-compare CAS token, R2-MED-2) + a server-side mode-exclusive refine (R2-MED-1). |
| `src/src/lib/templates/sanitize-custom-html.ts` (MODIFY — comment only) | Add a one-line note at the `parseStyleAttributes: false` site documenting the Q3 admin-trust boundary (CSS `url()`/`@import` not scheme-validated). No behavior change. |
| Tests (NEW/UPDATE) | PUT customHtml admin-only (403 coach incl. crafted body) + sanitize-on-write + atomic CAS + AuditLog prior-body/restore; column-scoped write (customHtml save leaves `content` untouched); clone drops customHtml for coach; variable enrichment resolves `{{registration_url}}`; editor RTL (admin sees textarea, coach does not). |

---

> **Task 1 (migration) — REMOVED per Q1.** Wave B is zero-migration: the prior body lives in an `AuditLog.changes` row written inside the save transaction (Task 2), and restore reads it back (Task 3). No `schema.prisma` change, no migration file, no migration-safety-gate step. Tasks renumbered below.

## Task 1: Shared enriched landing-page variable builder

**Files:** Create `src/src/lib/templates/landing-page-variables.ts`; test `src/src/__tests__/lib/templates/landing-page-variables.test.ts`.

The per-workshop save must resolve `{{registration_url}}` (Codex R1-H1) — `buildWorkshopVariables` alone does NOT include it; auto-build enriches it from the REGISTRATION page slug (`auto-build-service.ts:244-250`). Extract that enrichment into a reusable function.

- [ ] **Step 1: Failing test** — `buildEnrichedLandingPageVariables(workshopId)` returns the workshop variables PLUS `registration_url` resolved to `${APP_URL}/workshop/<regSlug>` when a REGISTRATION LandingPage exists, and `""` when none exists. Mock `db` + `buildWorkshopVariables`.
- [ ] **Step 2:** Run → fails (module missing).
- [ ] **Step 3: Implement** — compose `buildWorkshopVariables(workshopId)` (from `@/lib/templates/template-interpolation`) with a lookup of the workshop's REGISTRATION `LandingPage.slug`; set `registration_url` exactly as `auto-build-service.ts` does (absolute `${APP_URL}/workshop/<slug>`; empty string fallback). Return the merged record. Keep it pure/DB-reading only.
- [ ] **Step 4:** Run → passes. Build gate.
- [ ] **Step 5:** Commit: `feat(workshops): shared enriched landing-page variable builder (resolves registration_url)`.

> Optional (not required): refactor `auto-build-service.ts` to call this builder. Skip in Wave B to avoid touching the build path; just confirm the enrichment logic matches.

---

## Task 2: PUT route — accept customHtml (admin/staff-only), column-scoped write, sanitize-on-write, atomic CAS, transactional prior-body(AuditLog) + audit

**Files:** `src/src/app/api/workshops/[id]/landing-pages/[template]/route.ts` (the schema `updateLandingPageBodySchema` is **route-local** here — do NOT touch `lib/validations.ts`, R2-LOW-1); test `src/src/__tests__/api/workshops/landing-pages-customhtml.test.ts` (or extend the existing landing-pages route test).

- [ ] **Step 1: Failing tests** (TDD):
  - Coach PUT with `customHtml` in body → **403** (even though coach can edit `content`). Coach PUT WITHOUT `customHtml` → still 200 (no regression).
  - Admin PUT with `customHtml` containing `<script>` / `javascript:` → stored value is sanitized (no script, no `javascript:`).
  - Admin PUT with `customHtml` containing `{{registration_url}}` → stored value has the token resolved to the absolute URL (uses Task 1's builder).
  - **Column-scoped (Q6):** an admin customHtml-only PUT (no `content` in body) leaves the row's existing `content` UNCHANGED (assert the stored `content` equals the pre-save value).
  - **Value-compare CAS (Q6 / R2-MED-2):** admin customHtml PUT whose `expectedCustomHtml` ≠ the stored value → **409**; matching → 200. **Same-millisecond double-write:** two saves with the same `expectedCustomHtml` — only the first wins, the second 409s (proves ms-immunity vs the old `updatedAt` approach). A customHtml PUT on an existing row with the `expectedCustomHtml` field **absent** → **400**. **Mode-exclusive (R2-MED-1):** a PUT with `customHtml` AND any of `content`/`status`/`customCode` → **400**. Coach PUT (content only) → still 200.
  - **Prior-body store (Q1):** on a successful customHtml update, an `AuditLog` row exists with `entityType:"LandingPage"`, `entityId:<page id>`, `action:"UPDATE_CUSTOM_HTML"`, and `JSON.parse(changes).previousCustomHtml === <the value that was overwritten>` — written in the SAME transaction.
  - **No-row first save (R1-HIGH-1 + R2-HIGH-2):** admin customHtml save for a workshop+template with **no existing `LandingPage` row** and **no `expectedCustomHtml`** → **201/200 creating** the row with the sanitized customHtml (NOT a 400/409); the created row has **valid parseable `content`** (synthesized — not `undefined`) AND the sanitized `customHtml`; the prior-body audit row records `previousCustomHtml: null, op: "save"`. A concurrent second create (simulated `P2002`) → **409**.
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3: Implement.**
  - **Flag gate (Q9 / R3-HIGH-1):** when `WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED` is not truthy (default), any request carrying `customHtml` (and the restore/resolved actions in Task 3) → **403/404**; the rest of the PUT (content/customCode) behaves exactly as today. Optional allowlist check (actor/workshop/category) when set.
  - **Rate limit (Q9 / R3-MED-3):** wrap the customHtml write + restore in `withRateLimit` keyed per-actor (and ideally per-workshop) to bound audit-row growth from repeated large saves.
  - Define a small `sha(s: string)` helper (node `crypto`, sha256 hex) for the audit metadata.
  - Extend `updateLandingPageBodySchema` — which is **route-local** in `app/api/workshops/[id]/landing-pages/[template]/route.ts:25`, NOT in `validations.ts` (R1-LOW-1; edit it where it actually lives, else the validation change is a no-op): add `customHtml: z.string().max(CUSTOM_HTML_MAX_LENGTH).nullable().optional()` and `expectedCustomHtml: z.string().nullable().optional()` (the value-compare CAS token — R2-MED-2; replaces the ms-fragile `expectedUpdatedAt`). Reuse the `CUSTOM_HTML_MAX_LENGTH` constant from the page-templates route (import or re-declare a shared const). (NO `customHtmlPrevious` — that column does not exist.)
  - **Mode-exclusive body, enforced server-side (R2-MED-1):** a `customHtml` write must NOT be combined with `content`/`status`/`customCode` in the same request — reject (400 "customHtml save must be exclusive") if any of them accompany `customHtml`. This makes column-scoping a server invariant, not a UI promise; a stale or crafted admin request can no longer clobber block content or publish state through the HTML path. Add a Zod `.refine` or an explicit guard.
  - In the PUT route, after destructuring add `customHtml` + `expectedCustomHtml`. Gate exactly like `customCode` — and (R1-HIGH-1) the CAS requirement applies only to **updates** (an `existing` row); a first-save/create has nothing to conflict with. The route already loads `existing = await db.landingPage.findUnique(...)` before its if/else, so place the CAS-required check after that load:
    ```ts
    if (customHtml !== undefined && !isPrivilegedRole(actor.role)) {
      return NextResponse.json({ success: false, error: "Forbidden — admin/staff only" }, { status: 403 });
    }
    // CAS required only when updating an EXISTING row (no row ⇒ create path, no prior version to guard).
    // The token is the prior customHtml VALUE the editor loaded (R2-MED-2); the FIELD must be present (value may be null).
    if (customHtml !== undefined && existing && !("expectedCustomHtml" in body)) {
      return NextResponse.json({ success: false, error: "expectedCustomHtml required for customHtml save" }, { status: 400 });
    }
    ```
  - Eligibility: only SOLO_LANDING / DUO_LANDING may carry `customHtml` (use the existing `ELIGIBLE_CUSTOM_HTML` set); for ineligible templates, reject a non-null `customHtml` with 400.
  - Sanitize-on-write (two-stage, mirror auto-build): when `customHtml` is a non-empty string, `const vars = await buildEnrichedLandingPageVariables(id); const interpolated = vars ? interpolateContentForHtml(customHtml, vars) : customHtml; const { sanitized: safe, didStripContent: didStrip } = sanitizeCustomHtml(interpolated, { allowTokenUris: false });` (capture `didStrip` for the audit metadata — R3-MED-1). Let `safeOrNull = customHtml === null ? null : safe`. When `customHtml === null` → store `null` (clears the override → reverts to block layout). When `undefined` → leave unchanged.
  - **Column-scoped write + atomic CAS + AuditLog prior-body, in ONE transaction:**
    ```ts
    const where = customHtml !== undefined && existing
      ? { id: existing.id, customHtml: expectedCustomHtml ?? null }   // value-compare CAS gate (Q6 / R2-MED-2)
      : { id: existing.id };
    const updated = await db.$transaction(async (tx) => {
      const res = await tx.landingPage.updateMany({
        where,
        data: {
          updatedAt: new Date(),
          ...(content !== undefined ? { content: JSON.stringify(content) } : {}),  // content now OPT-IN (Q6)
          // Q8: preserve original publish logic on the status path; customHtml-only save (no status) leaves publish state untouched
          ...(status !== undefined ? { status, publishedAt: status === "PUBLISHED" ? new Date() : existing.publishedAt } : {}),
          ...(customCode !== undefined ? { customCode } : {}),
          ...(customHtml !== undefined ? { customHtml: safeOrNull } : {}),
        },
      });
      if (res.count === 0) return null;  // CAS miss → 409 (or row vanished)
      if (customHtml !== undefined) {
        await tx.auditLog.create({ data: {
          entityType: "LandingPage", entityId: existing.id, action: "UPDATE_CUSTOM_HTML",
          performedBy: actor.email,
          // R3-MED-1 structured metadata for observability + R3-MED-3 SHAs:
          changes: JSON.stringify({ op: "save", template: normalizedTemplate, previousCustomHtml: existing.customHtml ?? null, prevSha: sha(existing.customHtml ?? ""), newSha: sha(safeOrNull ?? ""), newCustomHtmlLength: (safeOrNull ?? "").length, actorRole: actor.role, sanitizerStripped: didStrip }),
        }});
      }
      return tx.landingPage.findUnique({ where: { id: existing.id } });
    });
    if (updated === null) {
      return NextResponse.json({ success: false, error: "This page changed since you opened it — reload and re-apply." }, { status: 409 });
    }
    ```
    Inline the `auditLog.create` in the `$transaction` (NOT the failure-swallowing `logAudit` helper — Q1). **Value-compare CAS (R2-MED-2):** `where.customHtml` is the exact prior value the editor loaded (`expectedCustomHtml ?? null`); a concurrent customHtml change makes the `where` miss → `count === 0` → 409. This is ms-immune (no timestamp dependency) and won't false-409 on a coach `content` save. Return the saved `customHtml` (or its presence flag) in the response so the client can fail-closed (Codex R3-M5).
  - **Post-interpolation length cap (R2-MED-3):** `CUSTOM_HTML_MAX_LENGTH` on the Zod schema only bounds the *input*; repeated tokens / long workshop fields can expand the interpolated+sanitized output to multi-MB. Enforce the cap on the **final `safeOrNull`** before writing/auditing: `if (safeOrNull && safeOrNull.length > CUSTOM_HTML_MAX_LENGTH) return 400 ("rendered HTML exceeds size limit")`. Applies to the create path too.
  - **No-row / first-save path (R1-HIGH-1 + R2-HIGH-2):** the editor can be pre-filled (Task 3 resolved-fallback) for a workshop whose SOLO/DUO `LandingPage` row does not exist yet — so a customHtml save must be able to **create** the row. Because the HTML save is mode-exclusive (R2-MED-1, no `content` in the body), the create branch **cannot** `JSON.stringify(content)` an `undefined` content (would insert invalid/`"undefined"` into the NOT-NULL `content` column — R2-HIGH-2). **Synthesize valid `content` inside the transaction:** derive it from the active `PageTemplate` for that pageType (the same source the create branch + resolved-fallback already use) — i.e. the existing create branch already computes a `content` for the template; reuse that path. If no active template content is resolvable, fall back to the route's existing default/empty-block content shape (whatever the current create branch emits) — never `undefined`. Then set `customHtml: safeOrNull`, and in the SAME transaction write the prior-body audit row with `previousCustomHtml: null, op: "save"`. No CAS on create (the existence-aware gate skips the token when `!existing`). Catch the `(workshopId, normalizedTemplate)` unique-index race (Prisma `P2002`) → **409** ("This page was just created elsewhere — reload and edit it"). Sanitize + length-cap `customHtml` identically to the update path. **Test:** the created row has BOTH valid parseable `content` AND the sanitized `customHtml`.
- [ ] **Step 4:** Run → passes. Build gate. ESLint.
- [ ] **Step 5:** Commit: `feat(workshops): per-workshop customHtml write (admin-only, column-scoped, sanitize+enrich, atomic CAS, AuditLog prior-body)`.

---

## Task 3: Resolved-fallback endpoint (pre-fill/refresh source) + restore action

**Files:** `src/src/app/api/workshops/[id]/landing-pages/[template]/route.ts` (extend GET + add a restore path); tests.

- [ ] **Step 1: Failing tests:**
  - Privileged GET with `?resolved=1` (or a dedicated sub-route) returns `{ customHtmlResolved }` = `sanitizeCustomHtml(interpolateContentForHtml(active PageTemplate.customHtml, enrichedVars), {allowTokenUris:false}).sanitized` (category precedence like the PUT create path) when an active template customHtml exists, else `""` (Q5 — this is the refresh/pre-fill source, always regenerated from the template + CURRENT vars; it does NOT echo the stored override). Coach → 403 on the resolved mode.
  - A restore action (admin-only) reads the **latest** `AuditLog` row scoped to `{ entityType:"LandingPage", entityId:<this page>, action:"UPDATE_CUSTOM_HTML" }`, takes `JSON.parse(changes).previousCustomHtml`, **re-sanitizes** it with the current sanitizer (no re-interpolation — Q7), and writes it via the SAME transactional+CAS+prior-body path as Task 2 (so restore is itself snapshotted/undoable). The new snapshot row uses `action:"UPDATE_CUSTOM_HTML"` with `op:"restore"` inside `changes` (R1-MED-2 — same action for every write, so the next lookup sees it). Entity-bound: a row from another workshop/template is never selected. CAS-guarded (`expectedCustomHtml` value-compare).
  - **save→restore→restore (R1-MED-2):** save body A→B (snapshot prevA), save B→C (snapshot prevB), restore → C reverts to B (snapshot prevC), restore again → B reverts to C. Asserts every prior body stays discoverable through restores (action never diverges).
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3: Implement** — extend the GET handler with a privileged `resolved` mode (admin/staff only) using Task 1's builder + the PageTemplate category-precedence lookup already present in the PUT create branch (factor it into a small helper to avoid duplication). **Flag-gate (Q9/R3-HIGH-1):** both the `resolved` mode and the restore action 403/404 when `WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED` is off. **Capability marker (Q9/R3-MED-2):** the normal landing-page GET and the `resolved` response include `customHtmlEditor: true` ONLY when the flag is on AND the actor is privileged — the client uses this to fail-closed (Task 5). Implement restore as a PATCH/POST action (`?action=restore-html` or a sub-route), admin-only: `findFirst` the latest scoped `UPDATE_CUSTOM_HTML` audit row → `previousCustomHtml` → `sanitizeCustomHtml(prior, {allowTokenUris:false}).sanitized` (or `null` if none) → persist via the Task 2 transactional pattern, recording the new snapshot with `op:"restore"` + the same structured metadata (R3-MED-1). If no prior row exists, return 404/no-op with a clear message.
- [ ] **Step 4:** Run → passes. Build gate.
- [ ] **Step 5:** Commit: `feat(workshops): resolved-fallback HTML endpoint + admin one-click restore (AuditLog-sourced, re-sanitized, transactional, CAS)`.

---

## Task 4: Close the clone-route bypass (security HIGH)

**Files:** `src/src/app/api/landing-pages/library/route.ts`; test.

The clone POST is coach-accessible and copies `sourcePage.customHtml` into the target (`route.ts:273`), bypassing the admin-only gate AND copying a resolved snapshot that carries the SOURCE workshop's baked-in coach/URL (R1-HIGH-2). The route has **two** write branches (create target + update existing target); **both** must enforce the policy (R1-MED-1).

> **Read the route first** to confirm both branches and the exact field names (`sourcePage.customHtml`, the create `data`, and any existing-target update path).

> **Policy (R1-HIGH-2 + R2-HIGH-1): the clone route must NOT be a `customHtml` writer.** It neither copies the source body (R1-HIGH-2 — Q4-resolved HTML would leak the source's baked-in coach/URL) nor clears an existing target's body (R2-HIGH-1 — a coach clone/retry clearing-to-null would erase an admin-authored override outside the admin-only CAS/audit/restore path). So: **omit `customHtml` from the clone's write entirely** in both branches.

- [ ] **Step 1: Failing tests:**
  - A clone that **creates** a new target → target `customHtml` is `null` (the column default; source body NOT copied). Include a case where `sourcePage.customHtml` has **no tokens** but contains source-specific values (source coach name / registration URL) → assert NONE of it lands on the target.
  - A clone whose target page **already exists with a non-null admin `customHtml`** → after the clone the target `customHtml` is **UNCHANGED** (NOT cleared, NOT overwritten) — for both coach and admin actors. The clone never erases an override.
  - No `UPDATE_CUSTOM_HTML` audit row is written by the clone route (it is not a customHtml writer).
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3: Implement** — **create branch:** simply do not include `customHtml` in the create `data` (Prisma defaults it to `null`); remove the existing `sourcePage.customHtml` copy. **update branch:** do not include `customHtml` in the update `data` at all (leave the target's existing value untouched). Net: the clone writes nothing to `customHtml`. Re-tuning a cloned page's HTML happens in the editor (Task 5/Task 3), which regenerates from the target's own active `PageTemplate.customHtml` and goes through the admin-only CAS/audit path. Leave a code comment citing R1-HIGH-2 + R2-HIGH-1.
- [ ] **Step 4:** Run → passes. Build gate.
- [ ] **Step 5:** Commit: `fix(workshops): clone route is not a customHtml writer — never copies (R1-HIGH-2) nor clears (R2-HIGH-1) the override (security)`.

---

## Task 5: Editor UI — admin-only customHtml textarea (solo + duo)

**Files:** `src/src/app/(dashboard)/workshops/[id]/landing-pages/solo-landing/page.tsx` + `duo-landing/page.tsx` (+ any shared editor component they use); RTL test.

> Read the two editor pages first to learn their existing data-load + save-payload shape; follow it. **R1-MED-3 — two things to verify and handle:** (1) **Role + capability, fail-closed.** These pages are client components and may not already have the session role. Determine the source: pass `actorRole` from a server component/loader, or fetch it; if the role **cannot be determined, treat as NON-privileged** (hide the HTML editor). Never default-open. Additionally (R3-MED-2 version-skew), render the editor ONLY when the GET/resolved response carries `customHtmlEditor: true` — if the marker is absent (old server, or flag off), hide the editor regardless of role. (2) **Payload separation.** The existing `Save Draft` / `Save & Publish` buttons send `content` + `status`. The customHtml save must be a **separate action** with its own payload builder that sends **only `{ customHtml, expectedCustomHtml }`** (never `content`/`status`) — otherwise an HTML save would also rewrite content/publish state, violating Q6/Q8 column-scoping. (The server also rejects mixed payloads — R2-MED-1 — but the client must not send them.) Do NOT bolt customHtml onto the existing block-save buttons.

- [ ] **Step 1: Failing RTL test:** admin sees the "Custom HTML (overrides block layout)" textarea pre-filled per the **Q5b precedence** (existing non-empty `customHtml` → else resolved-fallback → else empty); a coach/STAFF-without-privilege does NOT see it; when the role can't be determined the editor is hidden (fail-closed — R1-MED-3); the **"Save HTML"** action sends a payload of **only** `{ customHtml, expectedCustomHtml }` — assert it does NOT include `content` or `status` (R1-MED-3 payload separation; the server also rejects mixed payloads per R2-MED-1); the existing `Save Draft`/`Save & Publish` buttons still send `content`+`status` and never include `customHtml`; clicking "Refresh" opens a confirm dialog and, on confirm, replaces the textarea content with the resolved fallback **without** issuing a save (draft-only — Q5a).
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3: Implement** — surface the textarea (SOLO/DUO only), pre-filled per Q5b precedence (initial value: stored `LandingPage.customHtml` if non-empty, else the Task 3 resolved-fallback, else empty). Show the notices: "A non-empty HTML override replaces the block layout" · "This HTML is a **static snapshot** — later workshop edits (date/venue/price/link) won't update it." · **(Q8)** the page's current publish state, and when `status !== "PUBLISHED"` a hint: "This page is a draft — your HTML won't be public until the page is published." (No publish button here — publishing stays in its existing flow.) Add:
  - **"Refresh from current workshop data"** (Q5): confirm-gated (dialog: "This replaces the editor with a fresh copy built from the latest workshop details. Your current edits will be lost. Continue?"); on confirm it fetches the Task 3 resolved fallback and writes it into the **textarea (client state) only — NO save**. Disable the button when no active source template exists (resolved-fallback returns `""`).
  - **"Restore previous version"** (Q7): calls the Task 3 restore action (a real save through the sanitizing/CAS path).
  - **"Save HTML"** (its OWN button, R1-MED-3): builds the payload `{ customHtml, expectedCustomHtml }` and PUTs it — never includes `content`/`status`. Distinct from the page's existing `Save Draft` / `Save & Publish`. `expectedCustomHtml` = the prior `customHtml` value the editor loaded (the Q5b pre-fill source value, or `null` if the page had no override).
  - Clearing the textarea + **Save HTML** → sends `customHtml: null` (reverts to block layout).
  Render the textarea + these controls ONLY when the server-provided actor role is privileged, and OMIT `customHtml`/`expectedCustomHtml` from the PUT body otherwise. On a 409 from save, surface the "reload and re-apply" message.
- [ ] **Step 4:** Run → passes. Build gate. ESLint.
- [ ] **Step 5:** Commit: `feat(workshops): admin-only per-workshop custom-HTML editor (solo+duo) with confirm-gated draft refresh + restore`.

---

## Task 6: Sanitizer admin-trust note (Q3) + ops, rollback, observability (Q9)

**Files:** `src/src/lib/templates/sanitize-custom-html.ts` (comment); `src/scripts/rollback-workshop-customhtml.mjs` (NEW); observability surface (extend the existing spec-06 `/admin/observability` data queries, or document the queries if the dashboard isn't wired for this); tests for the rollback script's dry-run + CAS-skip logic.

- [ ] **Step 1:** In `sanitize-custom-html.ts`, add a one-line comment at the `parseStyleAttributes: false` site: `// Q3 (Wave B): admin-trusted surface — inline-style/<style> CSS url()/@import are NOT scheme-validated. customHtml is admin/staff-only; revisit if it ever becomes coach-writable.` No behavior change.
- [ ] **Step 2 (R3-HIGH-2 bulk rollback):** add `src/scripts/rollback-workshop-customhtml.mjs` — a **dry-run-by-default** ops script: given a deployment-window/actor/workshop filter, enumerate `UPDATE_CUSTOM_HTML` audit rows, compute the target `previousCustomHtml` per page, and (with `--apply`) restore each via the route's value-compare CAS (skip + report any page whose current `customHtml` already diverged from what the rollback expects), then write one summary `AuditLog` row. Guard against prod host like the other `src/scripts/*` guarded tools. Tests cover dry-run output + CAS-skip on a diverged page.
- [ ] **Step 3 (R3-MED-1 observability):** document/emit the dashboard counts (save/restore volume, 403/409 rates, sanitizer-strip count, cap rejects, resolved-fallback failures, **# public pages currently rendering a non-empty `customHtml`**) — DB-derived from the structured audit metadata (Task 2) + a `LandingPage` count query. Add alert thresholds for error/conflict/strip spikes (fits spec-06). If the dashboard isn't wired this wave, land the queries + thresholds as documented runbook SQL.
- [ ] **Step 4 (R3-MED-3 retention):** document the audit-growth retention policy (prune full prior-body text older than the latest-per-page beyond N days, keep the SHA; restore is single-level so only the latest hot body is needed) + confirm the Task 2 rate limit is in place. Automated pruning may be deferred; the policy + monitor query must be written.
- [ ] **Step 5:** Commit: `feat(workshops): Q3 sanitizer note + Q9 ops (flag, rollback script, observability, retention)`.

---

## Task 7: Full Wave B verification

- [ ] **Step 1:** `npm test -- --testPathPatterns="landing-page|library|landing-pages-customhtml|workshop|template-interpolation|rollback-workshop-customhtml"` → all green.
- [ ] **Step 2:** ESLint all changed files → clean.
- [ ] **Step 3:** `CI=true npx next build --turbopack` → clean.
- [ ] **Step 4:** Confirm `WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED` is **absent/off** in the committed config — merging changes nothing live; launch is a separate confirmed flip.
- [ ] **Step 5:** Final commit if any lint fixups.

---

## Self-review checklist (renumbered; T = new task numbers)
- Spec 17 Wave B: editor textarea ✔ (T5) · resolved pre-fill ✔ (T3/T5) · admin/staff-only write ✔ (T2) · sanitize-on-write ✔ (T2) · render precedence (already correct, no change — Q4 frozen-snapshot echo).
- Codex hardening: enriched `{{registration_url}}` ✔ (T1/T2) · static-snapshot + confirm-gated draft refresh ✔ (T5) · admin-only payload omission ✔ (T5) · resolved-fallback endpoint ✔ (T3) · input + **post-interpolation** size cap (R2-MED-3) + audit ✔ (T2) · value-compare CAS (R2-MED-2) ✔ (T2) · server-side mode-exclusive body (R2-MED-1) ✔ (T2) · one-click restore ✔ (T3) · echoed saved-customHtml in PUT response for fail-closed ✔ (T2).
- Round-2 hardening: clone is not a customHtml writer — never copies nor clears (R1-HIGH-2/R2-HIGH-1) ✔ (T4) · no-row create synthesizes valid `content` (R2-HIGH-2) ✔ (T2) · value-compare CAS replaces ms-fragile updatedAt (R2-MED-2) ✔ (T2) · mode-exclusive server invariant (R2-MED-1) ✔ (T2) · post-interpolation length cap (R2-MED-3) ✔ (T2).
- Security pass: clone-route bypass ✔ (T4) · transactional prior-body store in `AuditLog.changes`, NOT best-effort `logAudit` ✔ (T2/T3) · restore re-sanitized + entity-bound (`{workshopId,template}` scope) ✔ (T3).
- Round-3 ops hardening (Q9): kill-switch `WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED` default-off + canary, UI + server (R3-HIGH-1) ✔ (T2/T3/T5/T6) · dry-run-first bulk rollback script (R3-HIGH-2) ✔ (T6) · structured audit metadata + dashboard counts + alerts (R3-MED-1) ✔ (T2/T6) · version-skew capability marker, client fail-closed (R3-MED-2) ✔ (T3/T5) · rate limit + retention policy (R3-MED-3) ✔ (T2/T6).
- Grill decisions woven in: Q1 zero-migration (AuditLog store) · Q2 clone fix (T4) · Q3 CSS admin-trust note (T6) · Q4 frozen-snapshot (no render change) · Q5 draft-only refresh (T5) · Q6 column-scoped write + value-compare CAS (T2) · Q7 restore-as-a-Save (T3) · Q8 publish-lifecycle: customHtml save leaves status/publishedAt untouched, `publishedAt` preserved on the status path, DRAFT hint (T2/T5) · Q9 ops/rollout/observability (T2/T3/T5/T6).
- **Zero migration · zero destructive ops · default-off flag.** No `schema.prisma`/migration changes anywhere in Wave B; merging changes nothing live.

## Open verification notes for the implementer
- Confirm `ELIGIBLE_CUSTOM_HTML`, `CUSTOM_HTML_MAX_LENGTH`, and `interpolateContentForHtml` import paths (they exist — used by the page-templates route + auto-build).
- Read the two editor page components to match their actual data-load/save shape before adding the textarea; confirm how the actor role reaches the client (server component prop vs a session hook).
- Inline `auditLog.create` inside the `$transaction` (NOT the failure-swallowing `logAudit`) — Q1 requires the prior-body persist to be atomic with the customHtml write.
- **CAS is value-compare, not timestamp (R2-MED-2):** the editor echoes back the exact prior `customHtml` value it loaded as `expectedCustomHtml` (or `null`); the `updateMany` `where` includes `customHtml: expectedCustomHtml ?? null`. This is ms-immune and won't false-409 on a coach content save. Test a same-millisecond double-write: first wins, second 409s. (Comparing a large text value in `where` on a single-row-by-id update is fine; no index needed.)
- Return the saved `customHtml` (or a presence flag) in the PUT response (Codex R3-M5 version-skew) so the editor can fail closed if absent.

---

## Changelog

### Round 1 (Codex senior-engineer review · 2 high, 3 medium, 1 low) — ALL ACCEPTED
- **R1-HIGH-1 (no-row first-save path) — ACCEPTED.** The CAS gate required `expectedUpdatedAt` + updated `existing.id`, but the resolved-fallback can pre-fill the editor for a workshop with no `LandingPage` row → first save was undefined. Fix: CAS is now existence-aware (required only when `existing`); the create branch sets `customHtml` + writes a `previousCustomHtml: null, op:"save"` audit row in-tx; `P2002` on the `(workshopId, template)` unique index → 409. Added failing tests. (Task 2)
- **R1-HIGH-2 (admin clone copies stale resolved HTML) — ACCEPTED.** Q4 stores `customHtml` resolved (values baked in), so the planned "re-interpolate for target" was a no-op that would copy the SOURCE coach/URL onto the target. Fix: clone now sets `customHtml: null` for **all** actors — a faithful clone is impossible without a raw tokenized source (which we don't store); re-tuning happens in the editor (regenerates from the target's own template). (Q2, Task 4)
- **R1-MED-1 (clone update branch) — ACCEPTED.** The library route also updates existing target pages; the fix now applies the `customHtml: null` policy in **both** create and update branches, with a test for an existing target with a prior override. (Task 4)
- **R1-MED-2 (restore revision-action drift) — ACCEPTED.** Writing restores under `RESTORE_CUSTOM_HTML` would hide them from the next restore's `UPDATE_CUSTOM_HTML` lookup → restore-of-restore broken. Fix: every customHtml write (save AND restore) uses `UPDATE_CUSTOM_HTML`; the operation type moves into `changes.op` ("save"|"restore"). Added a save→restore→restore test. (Q1, Task 3)
- **R1-MED-3 (editor role source + payload coupling) — ACCEPTED.** The editor pages are client components that may not load the session role, and the existing Save Draft / Save & Publish buttons always send `content`+`status`. Fix: role source must be explicit + **fail-closed** (indeterminate ⇒ hide editor); customHtml save is its **own** action ("Save HTML") with a payload of only `{ customHtml, expectedUpdatedAt }` — never `content`/`status`. Added payload-separation RTL assertions. (Task 5)
- **R1-LOW-1 (schema location) — ACCEPTED.** `updateLandingPageBodySchema` is route-local (`route.ts:25`), not in `lib/validations.ts`; editing validations.ts would be a no-op. Fix: edit the route-local schema; file-structure row corrected. (Task 2)

**Rejected:** none — all six were material and grounded.

### Round 2 (Codex security & data-integrity review · 2 high, 3 medium, 1 low) — ALL ACCEPTED
- **R2-HIGH-1 (clone clear-to-null is an unaudited write) — ACCEPTED.** Round-1's "set customHtml=null for all actors, both branches" meant a coach clone/retry could ERASE an admin-authored override outside the admin-only CAS/audit/restore path. Fix: the clone route is **not a customHtml writer at all** — it omits `customHtml` from both branches (create ⇒ column default null; update ⇒ existing value untouched). Tests assert an existing admin override survives a coach clone and no `UPDATE_CUSTOM_HTML` audit row is written by the clone. (Q2, Task 4)
- **R2-HIGH-2 (no-row create inserts invalid content) — ACCEPTED.** The HTML save is mode-exclusive (no `content` in body), but the create branch did `JSON.stringify(content)` → would insert `"undefined"` into the NOT-NULL `content` column. Fix: the create path **synthesizes valid `content`** from the active `PageTemplate` (reusing the existing create-branch content source) before inserting; test asserts the created row has both valid parseable `content` and sanitized `customHtml`. (Task 2)
- **R2-MED-1 (column-scoping was UI-only) — ACCEPTED.** A crafted/stale admin request could send `customHtml` + `content`/`status`/`customCode` and clobber block/publish state server-side. Fix: the route now **rejects (400) any `customHtml` request that also carries `content`/`status`/`customCode`** — column-scoping is a server invariant, not a UI promise. Added crafted mixed-payload tests. (Task 2)
- **R2-MED-2 (updatedAt CAS not ms-safe) — ACCEPTED.** `updatedAt: new Date()` at ms precision lets same-millisecond/rapid-retry writes pass a stale CAS → lost update. Fix: replaced the `expectedUpdatedAt` timestamp CAS with a **value-compare** — `where: { id, customHtml: expectedCustomHtml }` (the prior value the editor loaded). Ms-immune AND eliminates the false-409 a content save would have caused. Added a same-millisecond double-write test. (Q6, Task 2)
- **R2-MED-3 (size cap pre-interpolation only) — ACCEPTED.** `CUSTOM_HTML_MAX_LENGTH` bounded only the input; repeated tokens / long fields can expand the output to multi-MB stored/rendered/audited HTML. Fix: enforce the cap on the **final sanitized `safeOrNull`** before write/audit (400 if exceeded); applies to the create path too. (Task 2)
- **R2-LOW-1 (stale validations.ts instruction) — ACCEPTED.** Task 2's `Files:` line still listed `lib/validations.ts`; removed (the schema is route-local). (Task 2)

**Rejected:** none — all six were material and grounded.

### Round 3 (Codex Ops & SRE review · 2 high, 3 medium, 1 low) — ALL ACCEPTED
- **R3-HIGH-1 (no runtime kill switch / canary) — ACCEPTED.** A bad save persists in data and survives a code rollback, so a deploy-only control is insufficient. Fix: ship behind a default-OFF `WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED` gate enforced by the UI AND the server write/restore/resolved endpoints, with optional actor/workshop/category allowlist for canary; the flag gates the editor/writer, not the public render. (Q9, Conventions, T2/T3/T5)
- **R3-HIGH-2 (no bulk rollback) — ACCEPTED.** Per-page restore can't revert a bad sanitizer/interpolation deploy across all touched pages. Fix: a dry-run-first `rollback-workshop-customhtml.mjs` script that enumerates `UPDATE_CUSTOM_HTML` audit rows by window/actor/workshop, restores `previousCustomHtml` with value-compare CAS (skipping diverged pages), and writes a summary audit row. (Q9, Task 6)
- **R3-MED-1 (no observability) — ACCEPTED.** Fix: the audit `changes` JSON now carries structured metadata (`op, template, actorRole, prevSha, newSha, sanitizerStripped, status`); add DB-derived dashboard counts + alert thresholds (save/restore volume, 403/409, sanitizer strips, cap rejects, resolved-fallback failures, # public pages rendering customHtml) per spec-06. (Q9, T2/T6)
- **R3-MED-2 (version-skew contract incomplete) — ACCEPTED.** A new client could call `?resolved=1`/HTML-only PUT against an old server. Fix: GET + resolved return a `customHtmlEditor` capability marker (only when flag-on AND privileged); the client fail-closes (hides editor) when the marker is absent. Added mixed-version tests. (Q9, T3/T5)
- **R3-MED-3 (unbounded audit growth) — ACCEPTED.** Full prior bodies in every audit row bloat the table/backups. Fix: per-actor/workshop rate limit on customHtml saves + a documented retention policy (prune full prior-body text older than the latest-per-page beyond N days, keep SHA; restore is single-level so only the latest hot body is needed) + a growth monitor. Automated pruning may be deferred to a follow-up; the policy + rate limit ship now. (Q9, T2/T6)
- **R3-LOW-1 (stale updatedAt CAS in file-structure row) — ACCEPTED.** The PUT route file-structure row still said "atomic updateMany CAS on `updatedAt`" — corrected to value-compare on `expectedCustomHtml`. (File structure)

**Rejected:** none — all six were material and grounded.

### Loop outcome
Three rounds run (senior-eng → security/data-integrity → ops/SRE); 18 findings total (6+6+6), all material, all accepted, none rejected. Per-round severity held at 2H/3M/1L — but each round targeted a DIFFERENT dimension (logic → security → ops), so the findings were additive, not the same issues resurfacing. Plan is materially hardened; remaining items (automated audit pruning, wiring the observability dashboard if spec-06 isn't extended this wave) are explicitly deferred follow-ups, not blockers.
