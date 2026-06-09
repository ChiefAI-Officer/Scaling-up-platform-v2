# Implementation Plan — Scaling Up Solo-Landing Template (Kajabi Custom HTML block)

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`. Spec: [`master-class-landing-kajabi.md`](./master-class-landing-kajabi.md). Pasteable artifact = spec **Appendix A** (generic, tokenized). **Hardened through a 3-round claudex/Codex adversarial review (2026-06-09)** — see "Adversarial hardening" at the bottom; the propagation, not the HTML, is the risky part.

**Goal:** Ship a Kajabi-faithful, token-driven Custom HTML block as the **global** SOLO_LANDING design, with guard tests, then propagate it to the existing solo pages via a **guarded, canary-first, audited, reversible migration**.

**Architecture:** Reuses TEMPLATE-02 (save-time sanitize → two-pass auto-build interpolate + strict re-sanitize → render echo). No schema migration, no new API route, no runtime code change. The HTML artifact is low-risk; the **prod propagation across every public solo landing page is the risk surface** and is treated as a controlled migration.

Source root: `src/src`. TDD (RED first). Build gate **`CI=true npx next build --turbopack`**.

---

## A. The artifact + guard tests (safe, do first)

### Task 0 — Finalize the single artifact
- Canonical block = spec **Appendix A**. Save it ONCE to `docs/specs/master-class-landing-kajabi.html` (paste-ready) + a sample-filled copy for screenshots. **All tests load this file** — never duplicate the markup in a test (prevents the version-skew the review flagged). Add a CI check that fails if the saved artifact's SHA diverges from Appendix A.
- **Coach photo = `<img src="{{coach_photo}}" alt="{{coach_name}}">`** (NOT a CSS `background-image`). Rationale (R2-High2): `src` URLs go through the sanitizer's URL allowlist + strict build-time re-sanitize, so a `javascript:`/bad value is stripped; a token in inline `style="...url()..."` is passed through UNPARSED (CSS-injection vector) — so dynamic tokens must never go in `style`. Empty-photo is handled by preflight (Task 7) + a platform default-avatar, not by markup tricks.
- Confirm: tokens exact double-brace; `@import` first line of `<style>`; no inline `<svg>`/`<link>`/`<iframe>`; every selector `.su-mc`-prefixed; no bare `body{}`; single `<h1>` first.

### Task 1 — Guard test: survives sanitization (RED→GREEN)
Extend `sanitize-custom-html.test.ts`. Load the artifact file; `sanitizeCustomHtml(block)` (default) ⇒ `didStripContent===false`; contains `@import`, `data-su-mc`, `href="{{registration_url}}"`, `src="{{coach_photo}}"`, `{{workshop_description}}`, `.ico-cal::before`; contains no `<svg`/`<path`/`<rect`/`<link`/`<iframe`.

### Task 2 — Guard test: interpolation + strict re-sanitize (RED→GREEN)
Extend `interpolate-content-html.test.ts`. Representative vars → `interpolateContentForHtml`: no `{{` left; `&`-title escaped once; `href="https://…/workshop/<slug>"`. Then `sanitizeCustomHtml(interpolated,{allowTokenUris:false})`: https `href`/`img src` survive; a `javascript:`-substituted **href AND img src** are stripped.

### Task 3 — Guard test: empty data degrades (RED→GREEN)
Empty `{{coach_photo}}`/`{{workshop_description}}`/`{{registration_url}}`: renders without throwing; empty About paragraph harmless. (Empty `coach_photo`/`registration_url` are PREVENTED from shipping by Task 7/8 preflights, not relied on as graceful at render.)

### Task 4 — Render-path smoke (RED→GREEN)
Extend `workshop-slug-custom-html.test.tsx`. Published SOLO_LANDING `LandingPage.customHtml` (interpolated block) on an approved (`PRE_EVENT`) workshop renders `data-custom-html-render` with title + Register link, not the React template.

### Task 5 — Playwright render verification (before any prod write)
Against a rendered customHtml page at desktop + mobile: `getComputedStyle(h1).fontFamily` includes "Fira Sans" (fonts load via `@import` under prod-like CSP); hero CSS icons draw; hero grid collapses to 1-col ≤760px; no global style leak into app chrome; screenshots captured.

## B. Propagation = a guarded migration (the risk surface)

### Task 6 — Dedicated CAS-guarded TEMPLATE update script (NOT the admin route)
The admin PATCH route has no expected-`updatedAt`/hash check (R2-High3/R3-Med1), so don't use it for prod. Write a one-off guarded script that: backs up the current global SOLO_LANDING `PageTemplate` `{id, updatedAt, customHtml, SHA=OLD_GLOBAL_HASH}`; refuses to write unless the live row still matches the expected old `updatedAt`/SHA; writes Appendix A; captures `NEW_GLOBAL_HASH`; writes an `AuditLog` (operator, old/new SHA, backup path). Provide the inverse restore (CAS on `NEW_GLOBAL_HASH`). Prod guard (`--i-know-this-is-prod`).

### Task 7 — Correct backfill TARGETING (fixes the round-1 hash bug)
`LandingPage.customHtml` is the **interpolated per-workshop snapshot**, so it will NEVER equal the raw template hash (R2-High1/R3-High1). Target instead by: (a) `sourceTemplateId == <old global SOLO_LANDING template id>`; AND (b) a **per-workshop expected-old hash** — re-render the BACKED-UP old template (Task 6 backup) with THAT workshop's variables + REGISTRATION slug, sanitize, SHA, and compare to the row's current `customHtml`; OR a stable old-design signature embedded in the markup. Rows that don't match (bespoke / category-scoped) are **skipped + logged**. Require an **expected matched-row count** confirmed before apply. **Coach-photo preflight:** require non-empty `coach.profileImage` for each target (skip/flag missing; or rely on the template's default-avatar). Tests: distinct workshops don't share a hash; a bespoke row is skipped; a matching row is rewritten.

### Task 8 — Strengthened CTA preflight
Not just "non-empty href" (R2-Med1): require an **absolute HTTPS URL on the expected production host**, and verify the slug belongs to a **PUBLISHED REGISTRATION page for the same workshop**, before writing. Fail/skip + report otherwise. Never globally ship a broken/relative/staging buy button.

### Task 9 — Price preflight = FAIL, not flag
Unresolved `TBD`/`Free`/price-vs-checkout mismatch **fails apply for that row** (R2-Low1) unless an explicit per-workshop exception de-emphasizes/removes the displayed price.

### Task 10 — Rollout-window safety
Patching/activating the template before backfill creates an untracked window where newly-approved workshops get the new HTML but aren't in the backfill backup (R3-High2). Mitigate: the **backfill consumes the explicit Appendix A artifact + `NEW_GLOBAL_HASH`** (it does not just read "current active template"); record the patch timestamp + `NEW_GLOBAL_HASH`; the rollback inventory **includes pages created after the patch timestamp carrying `NEW_GLOBAL_HASH`**. Prefer a brief approval-freeze or canary over a blind fanout.

### Task 11 — Canary + batch controls
Backfill supports `--slug` (single canary) and `--limit`/batch size (R3-Med2). Sequence: **one known slug (the Martin Segnitz page) → smoke check → small representative cohort → smoke → full apply**, with automated CTA/URL smoke checks between batches.

### Task 12 — Audit + observability (hard part of every mutation)
Template PATCH / backfill apply / restore each write an `AuditLog` (operator identity, old/new SHA, backup path, counts, skipped IDs + reasons, slugs, `runId`) as a non-optional step (R2-Med2/R3-Med3). Persist dry-run/apply/restore reports to `.snapshots/`. Add synthetic URL/CTA health checks.

### Task 13 — Idempotent rollback + operator runbook
Single rollback path that CAS-restores the PageTemplate by old/new hash AND restores the backfilled rows AND verifies no target row remains on the rolled-back hash (R2-Med3). Short operator runbook: preflight → canary → full apply → monitoring → restore commands + owner/signoff checkpoints (R3-Low).

## C. Apply + close
### Task 14 — Execute (prod, guarded, ordered)
Order: Task 6 (template PATCH, capture `NEW_GLOBAL_HASH`) → Task 7–9 dry-run inventory (review matched-row count, skips, CTA/price flags) → Task 11 canary (Martin Segnitz) → smoke → cohort → smoke → full `--apply --i-know-this-is-prod` (backup + CAS + audit). Verify live: target pages render the new look with each workshop's tokens; fonts/icons load; no broken images; CTA resolves to the right published registration page.

### Task 15 — Build gate + SoT
`CI=true npx next build --turbopack`; `npx eslint` touched files; `npm run test -- sanitize-custom-html interpolate-content-html workshop-slug-custom-html --passWithNoTests`. Update `plans/CHANGELOG.md` + `CLAUDE.md` anchor; `notion-task`.

## Notes
- No schema migration / new API route / runtime code change. New code = guard tests + two guarded one-off scripts (template update, backfill) + an artifact-hash CI check.
- Three known pre-existing unrelated test failures (`no-inline-tolocaledatestring` / `org-survey-exchange` / `assessment-campaigns-detail-route`) untouched.
- **Gate:** do not execute until the user gives the go-ahead. Tasks 6–14 touch prod; all are CAS-guarded, audited, canary-first, and reversible.

## Adversarial hardening (claudex review `20260609-043741-0904d9`, 3 rounds)
- **R1 (senior eng, 7):** backfill predicate too narrow → SHA-gate (later corrected in R2); clobber-bespoke → hash allowlist; dead-CTA preflight; CAS template PATCH; price preflight; coach `<img>` empty-state; Playwright check.
- **R2 (security/data-integrity, 8):** **SHA-gate compares interpolated snapshot to raw template hash → would skip every row** (fixed: per-workshop expected-old render, Task 7); **`background-image:url({{coach_photo}})` = CSS injection → reverted to `<img>`** (Task 0); admin PATCH not CAS → dedicated script (Task 6); CTA must be absolute-HTTPS-prod-host + published REGISTRATION (Task 8); durable AuditLog (Task 12); idempotent split rollback (Task 13); spec/PLAN artifact skew → single artifact + tests load it (Task 0); price mismatch → fail not flag (Task 9).
- **R3 (ops/SRE, 7):** targeting via `sourceTemplateId` + per-workshop render / design marker + expected matched-row count (Task 7); rollout-window backup gap → explicit-HTML backfill + window inventory (Task 10); canary/batch controls (Task 11); persisted reports + synthetic checks (Task 12); operator runbook (Task 13).
- **Caught two self-introduced R1 flaws** (the no-match SHA gate; the CSS-injection photo fix) — the review's main value.
```
