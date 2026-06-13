# Wave B — Per-Workshop Landing-Page HTML Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let admin/staff edit an individual workshop's landing-page **custom HTML** (Jeff's "on workshops" ask), surfacing the brought-across resolved HTML in the per-workshop editor, with sanitize-on-write, an audit trail, a one-click restore, and the clone-route security hole closed.

**Architecture:** Re-open the deliberately-blocked `customHtml` write on the per-workshop `PUT /api/workshops/[id]/landing-pages/[template]` route — **admin/staff-only** (mirroring the existing `customCode` rule), sanitized on write via the existing `sanitizeCustomHtml` + a post-interpolation strict re-sanitize, with the prior body persisted **in the same transaction** for restore. A shared landing-page variable builder enriches `{{registration_url}}` (the auto-build two-pass) so admin-typed tokens resolve. The editor pages (`solo-landing`, `duo-landing`) gain an admin-only HTML textarea pre-filled with the resolved this-workshop HTML (a new privileged resolved-fallback endpoint supplies it when no row exists). The coach-accessible **library clone** route is fixed to never copy `customHtml` for non-privileged actors.

**Tech Stack:** Next.js (App Router, Turbopack) · TypeScript · Prisma · DOMPurify (`sanitize-custom-html.ts`) · Jest + RTL.

**Conventions:**
- Commands from `/Users/diushianstand/Scaling-up-platform-v2/src`. Build gate `CI=true npx next build --turbopack`.
- Branch: `feat/workshop-html-editor` (off `main`).
- **One additive migration only** (Task 1 — a nullable column). Run `node scripts/check-migration-safety.mjs` (or the repo's migration-safety gate) before relying on it. NO destructive ops, NO `migrate reset/dev`.
- Scoped to Wave B. Do NOT touch Wave A (separate branch/PR).

**Authoritative spec:** `docs/specs/v7.6/17-jeff-june9-feedback-punchlist.md` — "Wave B" + the "Codex review — accepted hardening" (Wave B items) + "Security pass" subsections. Read those before starting.

---

## Grill revisions (pre-execution — these SUPERSEDE the tasks below where noted)

- **Q1 (migration) — DECIDED: no migration.** Do NOT add `LandingPage.customHtmlPrevious`. The build script auto-applies migrations (`prisma migrate deploy`) against the configured `DATABASE_URL`, and the local `.env` DB-target has a known mismatch history (PLAN.md HIGH) — so a new migration makes even local build-gate runs schema-mutating. Instead, store the prior body durably by writing it into a revision/audit row **inside the same `db.$transaction`** as the `customHtml` update (NOT via the failure-swallowing `logAudit`). Restore reads the latest such row. **Effect:** Task 1 is REPLACED (no schema/migration); Task 3's transaction includes the prior-body row; Task 4's restore reads it from there. Wave B is now **zero-migration**. Trade-off accepted: prior HTML (≤ `CUSTOM_HTML_MAX_LENGTH`) lives in the row's JSON, not a lean column (dedicated revision table deferred).

## File structure

| File | Responsibility |
|------|----------------|
| `src/prisma/schema.prisma` (MODIFY) | Add `LandingPage.customHtmlPrevious String?` (durable prior-body store for restore). Additive. |
| `src/prisma/migrations/<ts>_add_landingpage_customhtml_previous/migration.sql` (NEW) | The additive `ALTER TABLE ... ADD COLUMN` migration. |
| `src/src/lib/templates/landing-page-variables.ts` (NEW) | `buildEnrichedLandingPageVariables(workshopId)` — `buildWorkshopVariables` + the auto-build `registration_url` enrichment (resolve the REGISTRATION page slug → absolute URL). Shared by the PUT save, the resolved-fallback endpoint, and (optionally) refactored auto-build. |
| `src/src/app/api/workshops/[id]/landing-pages/[template]/route.ts` (MODIFY) | PUT accepts `customHtml` (admin/staff-only, mirror `customCode`); interpolate (enriched) + strict-sanitize; `updatedAt` compare-and-set; persist prior body + audit in one `db.$transaction`. New GET mode (or sub-route) returns the resolved fallback HTML. New restore action. |
| `src/src/app/api/landing-pages/library/route.ts` (MODIFY) | Clone never copies `customHtml` for non-privileged actors; admin clone re-sanitizes + re-interpolates for the TARGET workshop. |
| `src/src/app/(dashboard)/workshops/[id]/landing-pages/solo-landing/page.tsx` + `duo-landing/page.tsx` (MODIFY) | Admin-only `customHtml` textarea, pre-filled with resolved HTML; "non-empty overrides block layout" + "static snapshot" notices; "Refresh from current workshop data" action; clearing reverts. Omit `customHtml` from the payload for non-privileged users. |
| `src/src/lib/validations.ts` (MODIFY) | Extend `updateLandingPageBodySchema` with optional `customHtml: z.string().max(CUSTOM_HTML_MAX_LENGTH).nullable().optional()` + an optional `expectedUpdatedAt` for CAS. |
| Tests (NEW/UPDATE) | PUT customHtml admin-only (403 coach incl. crafted body) + sanitize-on-write + CAS + prior-body/restore; clone drops customHtml for coach; variable enrichment resolves `{{registration_url}}`; editor RTL (admin sees textarea, coach does not). |

---

## Task 1: Additive migration — `LandingPage.customHtmlPrevious`

**Files:** `src/prisma/schema.prisma`; new migration.

- [ ] **Step 1:** In `schema.prisma`, on `model LandingPage`, add below `customHtml String?`:
```prisma
  customHtmlPrevious String? // durable prior-body snapshot for admin one-click restore (Wave B)
```
- [ ] **Step 2:** Create the additive migration (additive only — a nullable column, no data change):
```bash
cd /Users/diushianstand/Scaling-up-platform-v2/src
npx prisma migrate dev --name add_landingpage_customhtml_previous --create-only
```
Inspect the generated SQL — it MUST be a single `ALTER TABLE "LandingPage" ADD COLUMN "customHtmlPrevious" TEXT;` with no drops/renames. If `migrate dev` is unavailable against the configured DB, hand-author the migration directory + `migration.sql` with that one statement (follow the repo's existing migration format).
- [ ] **Step 3:** Run the repo migration-safety gate (find it: `ls scripts | grep -i migration` — e.g. `check-migration-safety.mjs`) and confirm it passes (additive-only).
```bash
node scripts/check-migration-safety.mjs 2>&1 | tail -5
```
- [ ] **Step 4:** `npx prisma generate` then build gate `CI=true npx next build --turbopack 2>&1 | tail -5` (the build runs `prisma db push`/`migrate deploy`; confirm clean).
- [ ] **Step 5:** Commit: `feat(workshops): additive LandingPage.customHtmlPrevious column for per-workshop HTML restore`.

---

## Task 2: Shared enriched landing-page variable builder

**Files:** Create `src/src/lib/templates/landing-page-variables.ts`; test `src/src/__tests__/lib/templates/landing-page-variables.test.ts`.

The per-workshop save must resolve `{{registration_url}}` (Codex R1-H1) — `buildWorkshopVariables` alone does NOT include it; auto-build enriches it from the REGISTRATION page slug (`auto-build-service.ts:244-250`). Extract that enrichment into a reusable function.

- [ ] **Step 1: Failing test** — `buildEnrichedLandingPageVariables(workshopId)` returns the workshop variables PLUS `registration_url` resolved to `${APP_URL}/workshop/<regSlug>` when a REGISTRATION LandingPage exists, and `""` when none exists. Mock `db` + `buildWorkshopVariables`.
- [ ] **Step 2:** Run → fails (module missing).
- [ ] **Step 3: Implement** — compose `buildWorkshopVariables(workshopId)` (from `@/lib/templates/template-interpolation`) with a lookup of the workshop's REGISTRATION `LandingPage.slug`; set `registration_url` exactly as `auto-build-service.ts` does (absolute `${APP_URL}/workshop/<slug>`; empty string fallback). Return the merged record. Keep it pure/DB-reading only.
- [ ] **Step 4:** Run → passes. Build gate.
- [ ] **Step 5:** Commit: `feat(workshops): shared enriched landing-page variable builder (resolves registration_url)`.

> Optional (not required): refactor `auto-build-service.ts` to call this builder. Skip in Wave B to avoid touching the build path; just confirm the enrichment logic matches.

---

## Task 3: PUT route — accept customHtml (admin/staff-only), sanitize-on-write, CAS, transactional prior-body + audit

**Files:** `src/src/lib/validations.ts`; `src/src/app/api/workshops/[id]/landing-pages/[template]/route.ts`; test `src/src/__tests__/api/workshops/landing-pages-customhtml.test.ts` (or extend the existing landing-pages route test).

- [ ] **Step 1: Failing tests** (TDD):
  - Coach PUT with `customHtml` in body → **403** (even though coach can edit `content`). Coach PUT WITHOUT `customHtml` → still 200 (no regression).
  - Admin PUT with `customHtml` containing `<script>` / `javascript:` → stored value is sanitized (no script, no `javascript:`).
  - Admin PUT with `customHtml` containing `{{registration_url}}` → stored value has the token resolved to the absolute URL (uses Task 2's builder).
  - Admin PUT with stale `expectedUpdatedAt` → **409** (CAS); matching `expectedUpdatedAt` → 200.
  - On a successful customHtml update, the PRIOR `customHtml` is written to `customHtmlPrevious` and an audit row is logged — both in the same transaction.
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3: Implement.**
  - In `validations.ts`, extend `updateLandingPageBodySchema`: add `customHtml: z.string().max(CUSTOM_HTML_MAX_LENGTH).nullable().optional()` and `expectedUpdatedAt: z.string().datetime().optional()`. Reuse the `CUSTOM_HTML_MAX_LENGTH` constant from the page-templates route (import or re-declare a shared const).
  - In the PUT route, after destructuring add `customHtml` + `expectedUpdatedAt`. Gate exactly like `customCode`:
    ```ts
    if (customHtml !== undefined) {
      if (!isPrivilegedRole(actor.role)) {
        return NextResponse.json({ success: false, error: "Forbidden — admin/staff only" }, { status: 403 });
      }
    }
    ```
  - Eligibility: only SOLO_LANDING / DUO_LANDING may carry `customHtml` (use the existing `ELIGIBLE_CUSTOM_HTML` set); for ineligible templates, reject a non-null `customHtml` with 400.
  - Sanitize-on-write (two-stage, mirror auto-build): when `customHtml` is a non-empty string, `const vars = await buildEnrichedLandingPageVariables(id); const interpolated = vars ? interpolateContentForHtml(customHtml, vars) : customHtml; const safe = sanitizeCustomHtml(interpolated, { allowTokenUris: false }).sanitized;` Store `safe`. When `customHtml === null` → store `null` (clears the override → reverts to block layout). When `undefined` → leave unchanged (existing behavior).
  - CAS: if `expectedUpdatedAt` provided and `existing.updatedAt.toISOString() !== expectedUpdatedAt` → 409 stale.
  - Transaction: wrap the update so the prior body + audit are atomic:
    ```ts
    await db.$transaction([
      db.landingPage.update({
        where: { id: existing.id },
        data: {
          content: JSON.stringify(content),
          status: status || existing.status,
          updatedAt: new Date(),
          ...(customCode !== undefined ? { customCode } : {}),
          ...(customHtml !== undefined ? { customHtml: safeOrNull, customHtmlPrevious: existing.customHtml } : {}),
        },
      }),
      db.auditLog.create({ data: { entityType: "LandingPage", entityId: existing.id, action: "UPDATE",
        performedBy: actor.email, changes: { customHtmlChanged: customHtml !== undefined,
          prevSha: sha256(existing.customHtml ?? ""), newSha: sha256(safeOrNull ?? "") } } }),
    ]);
    ```
    (Do NOT put full HTML in the audit `changes` — SHA + flags only; the full prior body lives in `customHtmlPrevious`.) Use the repo's existing audit helper if it supports transactional inclusion; otherwise inline the `auditLog.create` in the `$transaction` array as above. A small `sha256` helper (node `crypto`) is fine.
- [ ] **Step 4:** Run → passes. Build gate. ESLint.
- [ ] **Step 5:** Commit: `feat(workshops): per-workshop customHtml write (admin-only, sanitize+enrich, CAS, transactional prior-body+audit)`.

---

## Task 4: Resolved-fallback endpoint (pre-fill source) + restore action

**Files:** `src/src/app/api/workshops/[id]/landing-pages/[template]/route.ts` (extend GET + add a restore path); tests.

- [ ] **Step 1: Failing tests:**
  - Privileged GET with `?resolved=1` (or a dedicated sub-route) returns `{ customHtmlResolved }` = `LandingPage.customHtml` if present, else `sanitizeCustomHtml(interpolateContentForHtml(global PageTemplate.customHtml, enrichedVars), {allowTokenUris:false}).sanitized` (category precedence like the PUT create path), else `""`. Coach → 403 on the resolved mode.
  - A restore action (admin-only) sets `customHtml = customHtmlPrevious` (re-sanitized with the current sanitizer) and swaps `customHtmlPrevious` to the value being replaced; audited; CAS-guarded; entity-bound (cannot restore across workshops/templates).
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3: Implement** — extend the GET handler with a privileged `resolved` mode (admin/staff only) using Task 2's builder + the PageTemplate category-precedence lookup already present in the PUT create branch (factor it into a small helper to avoid duplication). Implement restore as a PATCH/POST action (`?action=restore-html` or a sub-route) that is admin-only, re-sanitizes `customHtmlPrevious`, writes it via the same transactional pattern as Task 3, and is entity-bound (operates only on the `{id, template}` row).
- [ ] **Step 4:** Run → passes. Build gate.
- [ ] **Step 5:** Commit: `feat(workshops): resolved-fallback HTML endpoint + admin one-click restore (transactional, CAS)`.

---

## Task 5: Close the clone-route bypass (security HIGH)

**Files:** `src/src/app/api/landing-pages/library/route.ts`; test.

The clone POST is coach-accessible and copies `sourcePage.customHtml` into the target (`route.ts:273`), bypassing the admin-only gate and copying stale resolved HTML.

- [ ] **Step 1: Failing tests:**
  - A non-privileged (coach) clone → target `customHtml` is `null` (NOT copied from source).
  - An admin clone of an eligible SOLO/DUO source with `customHtml` → target `customHtml` is **re-interpolated against the TARGET workshop's enriched variables + strict-sanitized** (not a raw stale copy).
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3: Implement** — in the clone create, set `customHtml`:
  ```ts
  customHtml:
    isPrivilegedRole(actor.role) && ELIGIBLE_CUSTOM_HTML.includes(targetTemplateRaw) && sourcePage.customHtml?.trim()
      ? sanitizeCustomHtml(
          interpolateContentForHtml(sourcePage.customHtml, await buildEnrichedLandingPageVariables(targetWorkshop.id) ?? {}),
          { allowTokenUris: false },
        ).sanitized
      : null,
  ```
  (For non-privileged actors → `null`. Note the variables are the TARGET workshop's, not the source's — fixes the stale-copy half of the finding.)
- [ ] **Step 4:** Run → passes. Build gate.
- [ ] **Step 5:** Commit: `fix(workshops): clone route never copies customHtml for coaches; admin clone re-sanitizes+re-interpolates for target (security)`.

---

## Task 6: Editor UI — admin-only customHtml textarea (solo + duo)

**Files:** `src/src/app/(dashboard)/workshops/[id]/landing-pages/solo-landing/page.tsx` + `duo-landing/page.tsx` (+ any shared editor component they use); RTL test.

> Read the two editor pages first to learn their existing data-load + save-payload shape; follow it. They likely share a client editor component — add the textarea there, gated by the actor role passed from the server component.

- [ ] **Step 1: Failing RTL test:** admin sees the "Custom HTML (overrides block layout)" textarea pre-filled with the resolved HTML; a coach/STAFF-without-privilege does NOT see it; saving as admin includes `customHtml` + `expectedUpdatedAt` in the PUT body; saving as a non-privileged user OMITS `customHtml` entirely (so the route's admin gate is never tripped on a normal coach save — Codex R1-M7).
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3: Implement** — surface the textarea (SOLO/DUO only), pre-filled from the resolved-fallback endpoint (Task 4). Show the two notices: "A non-empty HTML override replaces the block layout" and "This HTML is a static snapshot — later workshop edits (date/venue/price/link) won't update it." Add a **"Refresh from current workshop data"** button that re-fetches the resolved fallback (preview/diff, explicit — does not silently overwrite; requires confirm) and a "Restore previous version" button (calls Task 4 restore). Clearing the textarea + save → sends `customHtml: null` (reverts to block). Render the textarea + these controls ONLY when the server-provided actor role is privileged, and OMIT `customHtml` from the PUT body otherwise.
- [ ] **Step 4:** Run → passes. Build gate. ESLint.
- [ ] **Step 5:** Commit: `feat(workshops): admin-only per-workshop custom-HTML editor (solo+duo) with refresh + restore`.

---

## Task 7: Full Wave B verification

- [ ] **Step 1:** `npm test -- --testPathPatterns="landing-page|library|landing-pages-customhtml|workshop|template-interpolation"` → all green.
- [ ] **Step 2:** ESLint all changed files → clean.
- [ ] **Step 3:** `CI=true npx next build --turbopack` → clean.
- [ ] **Step 4:** Final commit if any lint fixups.

---

## Self-review checklist
- Spec 17 Wave B: editor textarea ✔ (T6) · resolved pre-fill ✔ (T4) · admin/staff-only write ✔ (T3) · sanitize-on-write ✔ (T3) · render precedence (already correct, no change).
- Codex hardening: enriched `{{registration_url}}` ✔ (T2/T3) · static-snapshot + refresh ✔ (T6) · admin-only payload omission ✔ (T6) · resolved-fallback endpoint ✔ (T4) · size cap + audit ✔ (T3) · sanitizer CSS (uses `sanitizeCustomHtml` `allowTokenUris:false`; document `<style>` admin-trust if CSS-URL validation isn't added) · CAS ✔ (T3) · one-click restore ✔ (T4).
- Security pass: clone-route bypass ✔ (T5) · transactional restore store ✔ (T1/T3/T4, not best-effort audit) · `customHtmlSaved`/echoed SHA — return the new SHA in the PUT response so the client can fail-closed (add to T3 response).
- Migration: ONE additive nullable column only (T1); migration-safety gate must pass; NO destructive ops.

## Open verification notes for the implementer
- Confirm `ELIGIBLE_CUSTOM_HTML`, `CUSTOM_HTML_MAX_LENGTH`, and `interpolateContentForHtml` import paths (they exist — used by the page-templates route + auto-build).
- Read the two editor page components to match their actual data-load/save shape before adding the textarea; confirm how the actor role reaches the client (server component prop vs a session hook).
- Confirm the audit helper (`logAudit`) vs inlining `auditLog.create` inside `$transaction` — the security pass requires the prior-body persist to be transactional (NOT via the failure-swallowing `logAudit`); prefer the inline `$transaction` form.
- Return the saved `customHtml` SHA in the PUT response (Codex R3-M5 version-skew) so the editor can fail closed if absent.
