# CLAUDE.md Changelog — Historical Implementation Detail

Content extracted from CLAUDE.md on 2026-05-13. Organized newest-first by date. Each entry uses the format `### YYYY-MM-DD — <Title> <!-- ENTRY_ISO:YYYY-MM-DD ENTRY_SLUG:slug -->`.

Future entries should be appended at the TOP of the entries section below (newest first), and the `LAST_UPDATED_ISO` / `LAST_UPDATED_SLUG` anchor in CLAUDE.md's Project Context table should be updated to match the new top entry. The Jest test `src/__tests__/lint/changelog-freshness.test.ts` enforces this invariant.

---

### 2026-05-19 — Assessment Tool v7.6 — Template content form builder + multi-version forks: <!-- ENTRY_ISO:2026-05-19 ENTRY_SLUG:assessment-v7-6-form-builder-multi-version -->

Two complementary slices that complete the in-app template-authoring story. Together they replace the May 18 paste-JSON MVP with a real authoring workflow: structured form fields for everything in the scoring engine's input shape, plus the ability to evolve a published template by duplicating its latest version into a fresh editable draft.

**Form builder** (commit `72a3b6e`) — replaces the new-template paste-JSON textareas with structured inputs:
- Sections editor — name + description + partLabel + reorder buttons + add/remove. Removing a section also drops its questions (FK-like behavior in component state).
- Questions editor — label + helpText + section selector + required toggle + 5-field scale (min/max/step/anchorMin/anchorMax). All questions today are `SLIDER_LIKERT` — matches the runtime scoring engine.
- Scoring editor — `tierMetric` enum + `passThreshold` + tiers array with min / max-blank-for-unbounded / label / message. Reorder.
- `stableKey` auto-generated from order (`S1`, `S2`; `S1_Q1`, `S1_Q2`, `S2_Q1`, with counter resetting per section). No hand-coded identifiers in the UI.
- Submit-time validation: every section needs a name; every question needs a label + section + valid scale; every tier needs a label + message. Inline red banner gates the network call.
- `reportConfig` kept as paste-JSON for now (not part of scoring engine; advanced field).

**Multi-version forks** (commit `9d101e0`) — admins can evolve a published template without losing audit history:
- `POST /api/admin/assessment-templates/[id]/versions/[versionId]/duplicate` — copies all content + reportConfig into a new row with `publishedAt=null`. `versionNumber = max(existing for template+language) + 1`. Returns new id; UI redirects to the editor.
- `GET /api/admin/assessment-templates/[id]/versions/[versionId]` — fetches version + parent template (hydrates the editor form).
- `PATCH /api/admin/assessment-templates/[id]/versions/[versionId]` — edits content on a draft only. **409 `ALREADY_PUBLISHED`** on published versions (content is immutable post-publish). Recomputes `contentHash` from the canonical helper so the audit trail stays valid.
- New page `/admin/assessment-templates/[id]/versions/[versionId]/edit` hosts `AssessmentVersionEditor.tsx` — a content-only twin of the new-template form. Hydrates server JSON tolerantly (anything missing falls back to defaults). Renders read-only when published (with a banner explaining the workflow).
- Template detail page rows gain Edit (draft only) + Duplicate (any) + Publish (draft only) buttons.

**Tests**: 6 new in `versions-edit-duplicate.test.ts` — GET cross-template 404, PATCH 409 on published, PATCH happy path with `contentHash` recompute + audit, POST duplicate 404 cross-template, POST duplicate happy path with `versionNumber` bump + audit. Combined with the prior 14 template CRUD tests, the admin template surface is now 20 tests covered. Full suite still green.

**Build gates**: both slices passed `CI=true npx next build --turbopack` (26.6s + 26.1s).

**Deferred**:
- Multi-language version forks (today the duplicate copies the source language; admins can't fork to a new language from the UI).
- Per-question type extensions (TEXT, MULTI_SELECT, etc.) — scoring engine only handles `SLIDER_LIKERT` today.

### 2026-05-18 — Assessment Tool v7.6 — Admin template editor MVP: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-template-editor-mvp -->

Closes the largest remaining gap in the Assessment Tool v7.6 arc. Before today, admins had to ask a developer to write a seed script every time they wanted to launch a new assessment template. With this MVP, admins can name + describe + paste-JSON-content a new template, see it in a versions list, edit metadata, and publish a draft version — all from the in-app admin UI. The full form-builder (question editor, scoring tier editor, drag-to-reorder sections) is a separate future slice.

**Routes**:
- `POST /api/admin/assessment-templates` — atomic transaction creates `AssessmentTemplate` + first `AssessmentTemplateVersion` (versionNumber=1, language="en" default, `publishedAt=null` draft). Canonical `contentHash` via the new shared helper. 409 on alias collision (caught from Prisma P2002 in the catch). 400 on Zod validation. Audit `'CREATE'`.
- `PATCH /api/admin/assessment-templates/[id]` — edit metadata only (name, description, invitationSubject, invitationBodyMarkdown, aggregationMode). **alias is intentionally immutable** (URL-stability invariant); content is version-locked. Audit `'UPDATE'`.
- `DELETE /api/admin/assessment-templates/[id]` — soft-delete via `deletedAt`. 409 `TEMPLATE_HAS_ACTIVE_CAMPAIGNS` if any DRAFT or ACTIVE campaign references the template (CLOSED campaigns are fine — historical data). Audit `'DELETE'`.
- `POST /api/admin/assessment-templates/[id]/versions/[versionId]/publish` — sets `publishedAt` + `publishedBy`. 409 `ALREADY_PUBLISHED` (idempotent at the route boundary). 404 if version is on a different template. Audit `'UPDATE'` on the version.

**Shared helper** — `src/lib/assessments/template-content-hash.ts`: pulled out of the seed script so the admin POST route and the seed script produce byte-identical `contentHash` values for the same canonical content. Fixed key order: `{ questions, sections, scoringConfig, reportConfig, invitationSubject, invitationBodyMarkdown }` → `JSON.stringify` → sha256 → hex. DO NOT pretty-print, sort, or add whitespace.

**UI**:
- `/admin/assessment-templates` — list page with table (name / alias / aggregation / per-row delete). "New Template" button (top-right). Soft-delete uses a window.confirm; 409 surfaces as a friendly toast ("Close all active campaigns on this template first").
- `/admin/assessment-templates/new` — single-form-page create flow. Metadata fields (name, alias with regex hint, description, language, aggregationMode, invitation subject + body) + 4 paste-JSON textareas (questions, sections, scoringConfig, reportConfig optional). Client-side `JSON.parse` per field with inline error banner before submit.
- `/admin/assessment-templates/[id]` — detail page with metadata view + inline edit panel (Save / Cancel-reverts), versions table (versionNumber / language / Draft|Published pill / contentHash prefix / per-row Publish button on drafts).
- Nav entry "Assessment Templates" added to the dashboard layout under "Aggregate Report".

**Prisma JsonNull**: the create route uses `Prisma.JsonNull` for the optional `reportConfig` field — Prisma's `InputJsonValue` rejects plain JS `null` for nullable Json columns under strict tsc. Caught by Vercel's TS pass, not local turbopack.

**Tests**: 14 new in `templates-crud.test.ts`:
- POST: 401 unauth, 403 non-admin, 400 zod, 409 alias collision (P2002), 201 happy path asserting both rows created + audit
- PATCH: 404 missing, 200 happy path with audit + correct fields written
- DELETE: 404 missing, 409 active-campaigns, 200 soft-delete + audit
- Publish: 404 missing, 404 cross-template, 409 already-published, 200 happy path with publishedAt/publishedBy + audit

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in 41s. Commit `b9fe0ab`.

**Deferred (separate slices)**:
- Form builder for questions/sections/scoringConfig/reportConfig (paste-JSON for now).
- Adding new draft versions to an existing template (today the create flow always creates version 1; producing version 2+ needs a "duplicate version" action).
- Multi-language version forks.
- Translation workflow.

### 2026-05-18 — Assessment Tool v7.6 — Admin aggregate dashboard filters (Decision #8 MVP): <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-aggregate-filters -->

Decision #8 reserved this filter scope for day 1 but explicitly deferred it from the v1 MVP shape (template + version selector only). Now landed.

**Service** — `getAggregateReport(db, templateId, versionId, filters?)`:
- New optional 4th arg: `{ startDate?: Date | null, endDate?: Date | null, organizationId?: string | null }`.
- `organizationId` → added to `campaign` sub-where (`{ templateId, versionId, organizationId }`).
- `startDate` / `endDate` → built into a `submittedAt: { gte?, lte? }` clause on the top-level submission query. Only emitted when at least one is set, so the unfiltered call shape stays unchanged (existing 21 tests still green).

**API** — `GET /api/admin/assessments/aggregate?templateId=...&versionId=...&startDate=...&endDate=...&organizationId=...`:
- Date parsing accepts both `YYYY-MM-DD` and full ISO. 400 if a date param is present but invalid.
- Same params honored by `export.csv` and `submissions.csv` so CSV exports respect the current filter.

**UI** — `AssessmentsAggregateReport.tsx`:
- 3-column filter row below the existing template + version selectors: From date / To date / Organization select.
- Organizations sourced from `GET /api/organizations` (admin sees all). Best-effort; empty list just disables the dropdown.
- "Clear filters" link appears when any filter is set.
- ExportLink components forward `startDate` / `endDate` / `organizationId` into the CSV download URL.
- Report re-fetches on any filter change (added to the existing useEffect deps).

**Tests** — 3 new in `aggregate-report.test.ts`: organizationId WHERE plumbing, startDate+endDate `submittedAt` range, no-filter shape unchanged. 9/9 service-layer suite green; 21/21 across the 4 aggregate suites still green.

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in 64s. Commit `bf099c0`.

### 2026-05-18 — Assessment Tool v7.6 — CEO designation post-creation: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-ceo-post-create -->

Coaches can mark a respondent as CEO after the wizard submit — previously this required discarding the draft and re-running the wizard. Real workflow gap for the `template.aggregationMode === CEO_ONLY` reports, where one designated respondent's submission carries the campaign result.

**API** — `POST /api/assessment-campaigns/[id]/ceo/route.ts`:
- Body `{ participantId: string | null }` Zod-validated (string → set as CEO, null → clear all designation).
- `canManageCampaign` mode `"write"` (404 on auth-fail, hidden — Task F pattern).
- 409 `CAMPAIGN_CLOSED` for CLOSED campaigns (results immutable — no point changing CEO after close).
- 404 if `participantId` does not belong to this campaign (cross-campaign defense).
- Transaction: `updateMany({ where: { campaignId, isCEO: true }, data: { isCEO: false } })` first (honors the partial unique index on `campaignId WHERE isCEO=true`), then `update({ where: { id: participantId }, data: { isCEO: true } })` if non-null.
- Audit `'UPDATE'` with `{ ceoChanged: true, previousCeoParticipantId, currentCeoParticipantId }`.
- Rate-limited via `RateLimits.standard`.

**UI** — `CampaignDetail.tsx`:
- Per-row "Mark as CEO" button (small underlined link style) appears next to the name when row is NOT the current CEO AND campaign is not CLOSED.
- Current CEO row shows the existing badge + a small "(clear)" link.
- Loading state: button shows `"Setting…"` while in-flight; disabled across rows during the network call.
- Success → toast + `refreshRespondents()` + `router.refresh()` so the badge appears/moves.

**Tests** — 7 new in `ceo-post.test.ts`: 401/404/400/409 paths, 404 cross-campaign, set-and-clear-prior happy path with audit assertion, null-clears-all-without-update happy path.

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in 81s. Commit `af047f8`.

### 2026-05-18 — Ops fix: enable transactional email overrides in production (registration confirmation): <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:registration-email-overrides-enabled -->

**Symptom.** Jeff reported on a 9-min Zoom that the custom registration-confirmation email he authored at `/admin/transactional-emails/REGISTRATION_CONFIRMATION` was not being delivered — registrants received an older hardcoded version with different copy and styling. He also asked how to attach the `.ics` file and how to merge in the workshop's Zoom link.

**Root cause.** `composeRegistrationConfirmationEmail` ([src/src/lib/notifications/transactional-email-template.ts](../src/src/lib/notifications/transactional-email-template.ts)) opens with a Round-3 hardening kill switch:

```ts
function isOverrideEnabled() {
  return process.env.TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED === "true";
}
// ...
if (!isOverrideEnabled()) {
  return hardcodedDefaults(ctx);
}
```

The env var was never set in Vercel production (confirmed via `vercel env ls production`), so every registration-confirmation send — paid and free — short-circuited to `hardcodedDefaults()` and the DB-stored admin template was never read. Jeff's edits were saved correctly to the `TransactionalEmailTemplate` row (verified: `subject = "You're Registered: {{workshopTitle}}"`, body 1523 chars, `updatedAt 2026-05-18T20:28:45Z`) — the read path just never reached them.

**Fix.** Env-var-only change, no code:

```bash
echo "true" | npx vercel env add TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED production
npx vercel --prod --yes
```

Production deploy `pyghzkw2z` (56s build) → ● Ready. From this deploy onward, every registration confirmation reads the DB row, interpolates the supported tokens, and HTML-escapes registrant-controlled values (M3 security invariant from the original kill-switch implementation is preserved).

**Verified.**
- `vercel env ls production` shows `TRANSACTIONAL_EMAIL_OVERRIDES_ENABLED` (Encrypted, Production scope).
- Latest two production deploys both ● Ready, post-dating the env-add timestamp.
- DB row for `emailType = "REGISTRATION_CONFIRMATION"` exists and is populated.

**Supported tokens on this template** (interpolator at [src/src/lib/notifications/transactional-email-template.ts:131-138](../src/src/lib/notifications/transactional-email-template.ts#L131-L138)): `{{workshopTitle}}`, `{{coachName}}`, `{{registrantName}}`, `{{registrantEmail}}`, `{{format}}`, `{{virtualLink}}`, `{{venueName}}`, `{{venueAddress}}`. All HTML-escaped.

**ICS attachment.** Already wired and not gated by this flag. The free-registration Inngest handler ([src/src/inngest/functions/handle-registration-created-free.ts:83-97](../src/src/inngest/functions/handle-registration-created-free.ts#L83-L97)) generates the `.ics` and passes it to `sendPaidRegistrationNotificationStrict` as an attachment — independent of the template body. So Jeff's custom body now goes out **with** the calendar file attached. The paid path follows the same code path post-payment.

**Open follow-ons for Jeff** (template content, not code):
- Add `{{virtualLink}}` to the body where the Zoom paragraph should land. Auto-populates from `Workshop.virtualLink` for virtual workshops; resolves to empty string for in-person.
- Conditional rendering ("only show this paragraph if virtual") is **not** supported by the current interpolator — it does simple `{{token}}` substitution only. If product wants a "join online" block to disappear for in-person workshops, that's a separate scope: either (a) extend the interpolator with `{{#if format=VIRTUAL}}...{{/if}}` syntax, or (b) maintain two templates and route by `workshop.format` at send-time.

**Why this slipped through.** The kill switch was added in Round 3 H1 hardening with the intent to gate the admin override behind a deliberate prod flip. The flag was tested ([src/src/__tests__/lib/transactional-email-template.test.ts:94](../src/src/__tests__/lib/transactional-email-template.test.ts#L94)) but the prod-side flip was never queued as an explicit follow-on, so it stayed off indefinitely. No runbook entry pointed to it either, so when Jeff edited the template at the admin URL the system gave no feedback that the edits weren't going live.

**No commit** — env-var change in Vercel only.

---

### 2026-05-18 — Assessment Tool v7.6 — Task O UI follow-on — wizard email customization panel: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-task-o-ui -->

Backend for per-campaign invitation email overrides shipped earlier today. Task O UI follow-on wires the inputs into the campaign-create wizard's Review step so non-developer coaches can actually use the feature without hitting PATCH manually.

**Wizard state**:
- `WizardState` gains `invitationSubject: string` + `invitationBodyMarkdown: string` (empty string default → omitted from payload → backend null → fallback to template default).
- Auto-save resume path (`Task K`) merges both fields when present in stored `stepsData`.
- Campaign-create POST sends `invitationSubject` / `invitationBodyMarkdown` only when trimmed value is non-empty; otherwise the keys are omitted entirely (matches the schema's `.optional().nullable()` shape).

**UI** (`ReviewStep`):
- New collapsible "Customize invitation email" panel sits between the campaign summary and the action buttons. Closed by default; the subhead text reads `"Custom subject/body set for this campaign"` when either field is set, or `"Optional — leave blank to use the template default"` otherwise.
- When expanded: token-reference hint listing the 5 supported tokens (`{{respondentFirstName}}`, `{{respondentFullName}}`, `{{campaignName}}`, `{{invitationUrl}}`, `{{closeAt}}`), subject input (200-char cap, validation mirrors backend Zod), and Markdown body textarea (5000-char cap with live count).
- Placeholder text on both fields: `"Leave blank to use template default"` (we intentionally do NOT fetch the template default — that would require a new GET endpoint and the placeholder is sufficient signal).

**Follow-on (same day, commit `815d3d2`) — `CampaignDetail` post-create edit panel**:
- `CampaignOverview.campaign` now surfaces `invitationSubject` + `invitationBodyMarkdown` (the `findUnique({ include })` already returned them; only the type signature needed plumbing).
- `CampaignDetail.tsx`: new collapsible "Invitation email" card above the respondents table, hidden when status is CLOSED. Subhead reads `"Custom subject/body set for this campaign"` or `"Using template default — click to customize"`.
- Edit form: same shape as the wizard panel (subject input 200-char + Markdown body 5000-char + 5-token reference hint + char counter). Save button is dirty-aware; Cancel reverts to last-saved.
- Hits `PATCH /api/assessment-campaigns/[id]` (Task O backend already accepted both fields). Empty values send `null` so the campaign falls back to the template default. `router.refresh()` on success so the subhead updates.

**Build gate** (combined slice): `CI=true npx next build --turbopack` ✓ compiled in 79s (CampaignDetail run) + 105s (wizard run). 18/18 campaign-detail suite + 17/17 reminders/freshness suites green.

### 2026-05-18 — P0 fix: decouple HubSpot sync from paid registration email path: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:paid-registration-email-hubspot-decouple -->

**Symptom.** Coach reported the post-registration "you're registered" confirmation email never arrived. Production DB inspection showed both recent paid registrations (`cs_test_…` checkout sessions, Stripe test mode) with `paymentStatus=COMPLETED` but `paymentProcessedAt=NULL` and `notificationSentAt=NULL`. Across the entire DB, **zero registrations had ever had `notificationSentAt` set** — the paid path had never delivered an attendee email end-to-end.

**Root cause.** `processPaymentCompleted` ([src/src/inngest/functions/process-payment-completed.ts](../src/src/inngest/functions/process-payment-completed.ts)) ran steps in order: `fetch → hubspot-sync → send-notification-strict → mark-processed`. The HubSpot step called `createOrUpdateContact` which sent `workshop_name` and `workshop_date` as Contact properties — but those custom properties don't exist on HubSpot portal `4727286`. HubSpot returned `400 PROPERTY_DOESNT_EXIST`, the step threw, Inngest retried 4× (all retries hit the same validation error), then dead-lettered the entire function run. The `send-notification-strict` step never executed.

**Live replay confirmed the diagnosis.** Manually invoking `syncHubSpotIfMissing` against the most-recent stuck registration surfaced the exact `PROPERTY_DOESNT_EXIST` error; manually invoking `sendNotificationWithAtomicClaim` for the same row delivered all 3 emails (admin notification, coach notification, attendee confirmation with .ics attachment) successfully.

**Recovery (operational).** For the 2 stuck rows (`cmpbklvm4000o3uf21q0t6mli`, `cmpbkvfes00103uf2pfvli03u`), ran the notification helper directly to deliver the emails and set `paymentProcessedAt` so Inngest won't replay them.

**Fix (code).** Wrap the `step.run("hubspot-sync", …)` body in a try/catch that swallows + logs the error and returns `{ skipped: true, error }`. HubSpot is best-effort CRM sync and must not block transactional email delivery. Notification + mark-processed now execute even when HubSpot fails. Pattern mirrors the FREE-path HubSpot call which already uses `.catch((err) => console.error(…))` ([src/src/app/api/workshops/[id]/register/route.ts](../src/src/app/api/workshops/%5Bid%5D/register/route.ts)).

**Followups (not in this change).**
- The two missing HubSpot Contact properties (`workshop_name`, `workshop_date`) still get sent on every paid + free registration and will keep logging 400s until either (a) the properties are created in HubSpot portal `4727286` or (b) the fields are dropped from the `createOrUpdateContact` call sites. Cosmetic now that the step no longer throws, but worth cleaning up.
- The `step.run("hubspot-sync")` ghost-success: when the inner try/catch swallows, Inngest sees the step as succeeded. If we ever want HubSpot sync to retry on transient failures (without blocking email), we'd need a separate child function with its own retry policy.

**Test coverage.** Added regression test `HubSpot step: failure does not block email send or mark-processed` to [src/src/__tests__/inngest/process-payment-completed.test.ts](../src/src/__tests__/inngest/process-payment-completed.test.ts) — asserts `createOrUpdateContact` rejecting still results in `sendPaidRegistrationNotificationStrict` being called and `paymentProcessedAt` being set. Full suite: 10/10 green.

**Commit.** `2d4c604` (pushed direct to main).

---

### 2026-05-18 — Assessment Tool v7.6 — Task O — per-campaign invitation email overrides: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-task-o -->

Coaches can override the default invitation subject + body on a per-campaign basis. Before today, the only way to customize was at the `AssessmentTemplate` level — a single shared default across every campaign that used the template. Task O makes the override campaign-local.

**Schema**:
- `AssessmentCampaign.invitationSubject String?`, `AssessmentCampaign.invitationBodyMarkdown String?` (both nullable; `null` = use template default).
- Migration `20260518160000_add_campaign_invitation_overrides`.

**Validation**:
- `createAssessmentCampaignSchema`: accepts optional `invitationSubject` (≤200 chars) + `invitationBodyMarkdown` (≤5000 chars), both nullable.
- `updateAssessmentCampaignSchema`: same fields for PATCH (any-status — does not require DRAFT, since editing the reminder email body should be allowed on ACTIVE campaigns too).

**Route changes**:
- Campaign-create route persists both fields (defaults to `null`).
- Campaign PATCH route writes both fields when present.
- `invite` route and `reminders` route at the email call site:
  ```ts
  template: {
    invitationSubject:
      campaign.invitationSubject ?? campaign.template.invitationSubject,
    invitationBodyMarkdown:
      campaign.invitationBodyMarkdown ??
      campaign.template.invitationBodyMarkdown,
  }
  ```
  (Both routes already used `findUnique({ include })` so the new scalar fields flow through automatically without changing the query shape.)

**Tests**: 2 new in `reminders-post.test.ts` — `"Task O — campaign overrides take precedence over template defaults"` and `"Task O — null overrides fall back to template defaults"`. 13/13 suite green.

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in 4.2min. Commit `3fee453`.

**Deferred**:
- **Wizard UI for editing overrides** — backend + fallback ship now. Coaches can edit via PATCH today (e.g. from a future detail-page form). The wizard "Review" step should grow a small textarea pair in a follow-up slice.
- **No Markdown preview in the UI** when added — the existing helper does minimal HTML escaping + paragraph splitting. If product wants WYSIWYG, that's a separate scope.

### 2026-05-18 — Coach cert auto-promote — PENDING → ACTIVE on first workshop-type grant: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:coach-cert-autopromote -->

Closes a long-standing gap in the coach approval flow surfaced via the admin coaches page: coaches were stuck at `certificationStatus = "PENDING"` indefinitely because nothing in the app ever wrote that field after creation. The signup route (`POST /api/auth/coach-signup`) and admin coach-create (`POST /api/coaches`) both hardcode `"PENDING"`, `updateCoachSchema = createCoachSchema.partial()` doesn't include the field, and the coach-edit UI exposes no status control. The only existing `ACTIVE` rows in prod came from seed scripts or direct SQL — every coach who joined via the canonical flow showed PENDING beside their granted workshop-type cert chips. Fix: auto-promote on first cert grant.

- **Route change** — `src/src/app/api/coaches/[id]/certifications/route.ts` (POST handler): after the pre-flight duplicate check, if the loaded coach's `certificationStatus === PENDING_STATUS` (canonical constant from `lib/auth/coach-status.ts`) the cert create + a `coach.updateMany({ where: { id, certificationStatus: PENDING }, data: { certificationStatus: ACTIVE } })` flip run inside a single `db.$transaction([...])`. Non-PENDING coaches (ACTIVE / DEACTIVATED) skip the transaction and the route falls through to the plain cert create. DEACTIVATED is intentionally NOT promoted — reactivation must be explicit.
- **Race-guard** (Codex high-severity finding): the `updateMany` predicate filters on `certificationStatus: PENDING` so a concurrent DEACTIVATE between the pre-transaction read and the transactional write produces `count: 0` (no-op) rather than silently overwriting the deactivation. `promotion.count === 1` is required to emit the status-delta in the audit log; on `count: 0` the audit row only records `certificationAdded` with no status transition claim.
- **P2002 → 409** (Codex medium-severity finding): a concurrent grant that races past the preflight duplicate check now lands on the `@@unique([coachId, workshopTypeId])` constraint. The top-level catch detects `Prisma.PrismaClientKnownRequestError` with `code === "P2002"` and returns the same `409 "Coach already has this certification"` response shape as the preflight path — no more generic 500 on a concurrency loss.
- **Audit log** (Codex medium-severity finding): `logAudit({ entityType: "Coach", entityId: coachId, action: "UPDATE", performedBy: actor.email, changes })` fires on every successful grant. `changes` always includes `certificationAdded: workshopTypeId`; on promotion it also includes `certificationStatus: { from: "PENDING", to: "ACTIVE" }`. Fires AFTER the transaction so a failed grant never leaves a phantom audit row.
- **Tests** — `src/src/__tests__/api/coaches-certifications-auto-promote.test.ts` (8 cases, 246 lines): PENDING promotion happy path with sentinel-mocked `$transaction` args asserted in order, race-guard no-op when `updateMany.count === 0`, transaction-rejection returns 500 with no echoed cert and no audit row, already-ACTIVE skip, DEACTIVATED no-promote, pre-flight 409, P2002 in-catch 409 (via inline-mocked `PrismaClientKnownRequestError`), and 404 on missing coach.
- **Commits**: `94f067f` (feature) + `152efee` (Codex hardening pass).
- **Verification**: Turbopack build green on both commits, 8/8 auto-promote tests + 1740/1741 full suite green (the 1 fail is the known `registration-form-redirect.test.tsx` 5s timing flake — passes in isolation). Vercel deploy `rbrdxqb8w` Ready in 58s.
- **Coach Detail / Coaches list UI** unchanged — the existing PENDING/ACTIVE badge logic already reads `coach.certificationStatus`, so the next granted cert now flips the pill automatically.

---

### 2026-05-18 — Assessment Tool v7.6 — Tasks M + N — bulk CSV import + reminder emails: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-tasks-m-n -->

Two follow-on slices that close real workflow gaps coaches hit at scale: roster bulk-import (so big-org coaches don't click 50× to add respondents) and a single button to re-prompt invited participants who haven't yet submitted.

**Task M — Bulk respondent CSV import**

Pure parser, idempotent route, two UI surfaces (wizard + post-create modal).

- **Parser** — `src/src/lib/assessments/respondent-csv.ts` (194 lines): headers required (`name,email[,team]`, case-insensitive), Zod email validation per row, `/`-delimited team path, dedupe-on-email (first occurrence wins), 500-row cap with truncation errors emitted for rows 501+, RFC-friendly CSV parsing (handles quoted fields with embedded commas). Pure function returning `{ rows, errors }` — no I/O.
- **API** — `POST /api/organizations/[id]/respondents/bulk/route.ts` (399 lines): body `{ rows, mode: 'skip' | 'merge' }` Zod-validated, ownership gate (`organization.ownerCoachId === actor.coachId`), 500-row server-side cap (422 if exceeded). Wraps the batch in a single Prisma transaction. Returns ARRAYS `{ created: [{id, email}], updated: [{id, email}], skipped: [{email}], errors }` rather than bare counts — caller needs IDs to chain participant-add calls. Audit `'CREATE'` with summary counts. Rate-limited `RateLimits.standard`.
- **Campaign-create route extension** — accepts optional `bulkRespondents: Array<{name, email, teamPath}>` field. Server-side processes alongside the existing single-respondent list; same skip-on-email-conflict semantics. Teams auto-created via `buildTeamPath`.
- **UI 1 (CampaignDetail Add modal)**: new "Bulk CSV" tab next to "Single". Paste textarea OR live-preview table OR per-row error highlight (`text-destructive`). Conflict-mode radio (Skip / Merge, default Skip). Submit chains bulk-create → loop participant-add (Task L's `POST /respondents`) with `"Adding N of M…"` progress text. Final toast + modal close + respondents refetch.
- **UI 2 (CampaignWizard respondents step)**: inline panel (not modal — wizard) for paste-preview-submit. Rows stored in wizard state's `bulkRespondents` field; processed at final wizard submit by the extended campaign-create route.
- **Tests**: 36 new across 2 suites (`respondent-csv.test.ts` 25 cases, `respondents-bulk-post.test.ts` 11 cases).
- **Vercel-only TS hotfixes** (`fb42efc` + `0c84b24`): the `(await tx.orgTeam.create(...)) as TeamRow` pattern triggers `'implicitly has type any because it is referenced directly or indirectly in its own initializer'` under Vercel's strict tsc but passes the local turbopack build. Fix: explicit annotation `const created: TeamRow = (await ...) as TeamRow`. Applied in both `assessment-campaigns/route.ts:407` and `respondents/bulk/route.ts:203`.

**Task N — Reminder emails for non-responders**

Reuses Task D's invitation infrastructure; adds a single-click bulk action.

- **API** — `POST /api/assessment-campaigns/[id]/reminders/route.ts` (340 lines): body `{ participantIds?: string[] }` — omitted means "all pending non-submitted, non-revoked, non-soft-deleted participants". `canManageCampaign` gate (404 on auth-fail). 409 `CAMPAIGN_NOT_ACTIVE` on DRAFT/CLOSED. **Token rotation**: reuses the existing invitation row id and `expiresAt`/status, but rotates the cryptographic token (mirrors `/resend` route's security model — `tokenHash` is one-way, so the prior raw token is invalidated). Per-participant skips logged in audit; SMTP failure on one participant does NOT 500 the batch. Returns `{ sent, skipped, failed: Array<{participantId, reason}> }`. Audit action `'INVITE'`. Rate-limited.
- **UI** — `CampaignDetail.tsx`: new "Send Reminders" header button (visible only when `campaign.status === 'ACTIVE'`). Click → `window.confirm` with pending-count → POST → toast `"Sent X, skipped Y, failed Z"` + respondents refetch. Per-row Resend button already shipped in Task D — Task N adds the bulk action only.
- **Tests**: 11 new in `reminders-post.test.ts` covering bulk + single + skip-submitted + skip-no-invitation + skip-revoked + 409-not-active + auth + SMTP-failure-continues + all-skipped happy path.

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in ~5min. Task M deploy `rbrdxqb8w-chief-aio-fficer.vercel.app` ● Ready in 58s; Task N deploy `41f259f` pending. 1738 / 1738 tests green across 204 suites (up from 1691).

**Concerns (deferred)**:
- Task M wizard preview has no inline-edit (typos require re-paste). Gold-plate skipped.
- Task N reminder email body uses the Task D template verbatim — no "Reminder:" prefix differentiation yet. Acceptable for v1; product can iterate.
- A parallel session shipped unrelated coach-cert-autopromote work (`94f067f`) and repeatedly stashed Task M files mid-session as "park unrelated changes". Recovered via `git stash` reflog (`stash@{0}^3` for untracked, `stash@{0}` for tracked). No data lost.

### 2026-05-18 — Assessment Tool v7.6 — Task L — post-creation participant management: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-task-l-participant-mgmt -->

Closes a real workflow gap: coaches can now add a forgotten respondent or remove a stale one after creating a campaign, without having to discard and recreate. Builds on Task D's invitation token system + Task F's CampaignDetail UI.

**API**:
- `POST /api/assessment-campaigns/[id]/respondents` — body `{ orgRespondentId }` Zod-validated. Auth via `canManageCampaign` (404 on auth-fail). Error matrix: 409 `ALREADY_PARTICIPANT`, 422 `WRONG_ORGANIZATION`, 409 `CAMPAIGN_CLOSED`. On success: transaction creates `AssessmentCampaignParticipant` row, snapshots `teamPath` via the shared `buildTeamPath` helper, AND — only when `campaign.status === 'ACTIVE'` — mints a PENDING `AssessmentInvitation` row (token + sha256 hash via Task D's `invitation-tokens.ts` helper; SMTP send NOT triggered here — coach uses the existing Resend button). DRAFT campaigns intentionally skip invitation creation. Audit log action `'CREATE'`. Rate-limited via `RateLimits.standard`.
- `DELETE /api/assessment-campaigns/[id]/participants/[participantId]` — auth via `canManageCampaign`. 404 on missing-participant or campaignId mismatch. 409 `ALREADY_SUBMITTED` when any `AssessmentSubmission` row exists for `(campaignId, respondentId)` — results are immutable. On success: transaction `deleteMany` on invitation rows (covers 0-or-1) then `delete` on the participant row. Audit `'DELETE'`. Returns 204. Rate-limited.

**Schema cascade finding**: `AssessmentCampaignParticipant`, `AssessmentInvitation`, `AssessmentSubmission` relations have **no `onDelete: Cascade`** in `prisma/schema.prisma`. The DELETE route therefore deletes invitation rows explicitly inside a transaction; submissions are guarded by the 409 check.

**UI — `CampaignDetail.tsx`**:
- "Add Respondent" button above respondents table, hidden when `campaign.status === 'CLOSED'`.
- Add modal: select from existing org respondents (filtering out current participants), OR inline "Create new respondent" form that posts to `/api/organizations/[orgId]/respondents` then auto-selects the new ID.
- Per-row Trash icon hidden when `hasSubmission || invitation.status === 'SUBMITTED' || campaign.status === 'CLOSED'`. Confirm dialog → DELETE → re-fetch respondents + `router.refresh()` so the stats card updates.

**Tests**: 19 new (11 in `respondents-post.test.ts` + 8 in `participants-delete.test.ts`). Full project suite **1691 / 1691 green across 202 suites** (up from 1672).

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in 55s. ESLint clean on 5 changed files. Commit `2de6786`, Vercel `ngvosvan4-chief-aio-fficer.vercel.app` ● Ready in 1m.

**Concerns (deferred)**:
- POST does NOT send SMTP — only mints a PENDING invitation. Coach uses Resend button. Keeps single-add fast and out of Vercel's 30s SMTP budget.
- Used "submission exists" as immutability guard (schema has no `scoredAt` — spec referenced it but only `submittedAt` exists). Stricter than scoredAt-based gating, matches spirit.

### 2026-05-18 — Assessment Tool v7.6 — Task K — campaign wizard auto-save drafts: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-task-k-wizard-drafts -->

Wizard UX gap closed: coaches who walk away mid-creation can now resume where they left off. Mirrors the existing `WorkshopDraft` pattern verbatim (same upsert contract, same `coachId`-unique gating) so future maintainers have a stable precedent.

**Schema**:
- New model `CampaignWizardDraft` (`@@map("assessment_campaign_wizard_drafts")`) with `coachId` as a unique foreign key to `coaches(id)` with `ON DELETE CASCADE`. Stores `currentStep` (Int, default 1), `stepsData` (TEXT, JSON-stringified wizard state), `lastSavedAt`, `createdAt`, `updatedAt`.
- Back-relation `campaignWizardDraft CampaignWizardDraft?` on `Coach`.
- Migration `20260518130000_add_campaign_wizard_draft` (raw SQL: CREATE TABLE + unique index + FK).

**API — `/api/assessment-campaign-drafts/route.ts`** (153 lines):
- `GET` — `findUnique` by coachId; returns the draft or `null`.
- `PUT` — `{ step, data }` Zod-validated, upsert by `coachId`. Returns `{ success: true, draftId }`. Rate-limited via `RateLimits.standard`.
- `DELETE` — `deleteMany` (no-op if no row). Returns `{ success: true }`. Rate-limited.
- Auth pattern uses `getApiActor()` + `actor.coachId` gate (matches `assessment-campaigns/route.ts`) — deliberately NOT `requireCoach()` because that helper calls `redirect()` which is unsafe inside API routes. Returns 401 (unauthenticated) / 403 (non-coach actor).

**UI — `CampaignWizard.tsx`** (+244 net lines):
- Resume banner above wizard: `"Resume your draft? Last saved {formatDistanceToNow}. [Resume] [Discard]"`. Resume hydrates state via `JSON.parse(draft.stepsData)`, jumps to `draft.currentStep`. Discard fires `DELETE` and starts fresh.
- Debounced 800ms auto-save during field edits. Immediate flush on step transitions (back/next).
- Subtle "Saving…" / "Saved Xs ago" indicator in wizard header (uses `useMemo` for the timeago text).
- Clear-on-submit: successful campaign creation fires `DELETE` so the next campaign starts blank.
- Defensive parse: `JSON.parse` wrapped in try/catch — on failure, treats as no draft AND fires `DELETE` to clean up the corrupt row.

**Tests**: 15 new cases in `src/src/__tests__/api/assessment-campaign-drafts.test.ts` (GET null/200 paths, PUT create + update + validation, DELETE idempotent, 401/403 on unauth/non-coach, corrupt-data handling). Full suite 1672/1672 passing (200 suites; up from 1657).

**Build gate**: `CI=true npx next build --turbopack` ✓ compiled in 41s. ESLint 0/0 on changed files. Deploy: commit `fbd6e94`, Vercel `crr3v4ixv-chief-aio-fficer.vercel.app` ● Ready in 57s.

**Known follow-on (deferred)**: `stepsData` has no schema version. Future wizard schema changes that add new fields will load old drafts with default values for the new fields — acceptable today; a `version` field is the obvious upgrade path if step shapes start to drift incompatibly.

### 2026-05-18 — Assessment Tool v7.6 — Tasks I + J — campaign status transitions + CSV exports: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-tasks-i-j -->

Two polish slices on top of the Tasks A–H arc, plus three Vercel-only hotfixes for staging-miss bugs across the session. v1 implementation now covers daily-ops + reporting.

**Task I — Campaign status transitions**:
- `POST /api/assessment-campaigns/[id]/close` — DRAFT|ACTIVE → CLOSED with optional `reason` (≤500 chars, audit-logged). `canManageCampaign` gate (404 on auth-fail). 409 if already CLOSED. Tolerant body parser (missing/empty/bad-JSON → `{}`, only well-formed schema-failing body 400s).
- Close button on `/portal/assessments/[id]`: label adapts by status — "Discard Draft" (destructive variant) for DRAFT, "Close Campaign" (outline + destructive text) for ACTIVE, HIDDEN when CLOSED. Confirmation dialog with optional reason textarea, spinner during request, toast on success/failure.
- Status filter pills on `/portal/assessments` landing: All / Draft / Active / Closed with per-status counts. Client-side filter, empty state when filtered to zero.
- 18 new tests (3 suites): close-route 7 + campaign-detail-close-button 6 + portal-assessments-status-filter 5.

**Task J — CSV export endpoints + UI download buttons**:
- 4 new audit-logged, rate-limited routes:
  - `GET /api/assessment-campaigns/[id]/respondents/export.csv` — coach/admin, per-respondent summary.
  - `GET /api/assessment-campaigns/[id]/respondents/[rid]/result/export.csv` — coach/admin, per-question shape joined to version sections + questions.
  - `GET /api/admin/assessments/aggregate/export.csv?templateId=&versionId=` — admin only, summary stats block + per-section means block separated by blank line.
  - `GET /api/admin/assessments/aggregate/submissions.csv?templateId=&versionId=` — admin only, one row per submission with dynamic `Section_S{n}_Total` columns from `version.sections`. CEO joined from `AssessmentCampaignParticipant`.
- UI wiring on `CampaignDetail.tsx` (header export + per-row download) and `AssessmentsAggregateReport.tsx` (two export buttons under selectors, disabled when selector empty). Native `<a download>` links; no JS state.
- AuditAction extended with `'EXPORT'` (mirrors recent `'CLOSE'` addition).
- 17 new tests (4 suites): respondents-export 4 + per-respondent result export 4 + aggregate summary export 5 + aggregate submissions export 4. Each asserts Content-Type, Content-Disposition filename pattern, and a sample data row.

**Hotfixes shipped in the same window** (Vercel-only catches — local builds passed):
1. `Prisma.sql` arg vs tagged template (Task A audit). `tx.$executeRaw(Prisma.sql\`…\`)` → `tx.$executeRaw\`…\`` across 5 call sites. Jest mocks hid the type error.
2. Missing `org-survey-client.tsx` (Task D). Untracked new file not in the staging path list; Turbopack on Vercel fails fast on missing modules; webpack lazy-resolves.
3. Missing `CampaignsListWithFilter.tsx` (Task I-1). Same pattern.
4. Missing `'CLOSE'` in `AuditAction` union (Task I-2). MODIFIED existing service-layer file (`src/lib/audit.ts`), not a new file. The grep-imports rule from `feedback_turbopack_build_gate` only caught NEW untracked files; this was a modified one. Memory updated to default to `git add -A` + visual review of `git diff --cached --stat`.

**Tests**: 1657 passing across 199 suites (up from 1622 after Task H). 35 new tests across 7 suites for Tasks I+J. Zero regressions.

**Discipline**: pre-push gate stays `CI=true npx next build --turbopack`. Staging discipline expanded — default to `git add -A` for subagent work, review the staged diff, never rely on a hand-curated path list.

---

### 2026-05-18 — Assessment Tool v7.6 — Task H coach trends/longitudinal page (Wave 1 wireframe 10 made real — year-over-year composite-score line + per-section trend table + per-question sparkline grid): <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-task-h-trends -->

Coach picks (template, organization) at `/portal/assessments/trends` and sees year-over-year score progression across all their campaigns for that pair. Closes the v1 "year-over-year" feature gap that's the entire reason for Issue #10.

**Service** (`src/lib/assessments/trends.ts`):
- `getLongitudinalTrend(db, templateId, organizationId)` — resolves the latest published version of the template; partitions campaigns into included (latestVersion) vs excluded (older versions); builds per-campaign series + per-question sparkline series + means.
- v1 single-version constraint enforced server-side (older-version campaigns excluded + counted; banner surfaces in UI).
- Reads `submission.result` frozen — no recomputation.
- Composite score per v7.1 spec: uses `tierMetricValue` (per-template metric), NOT blind mean of numeric answers.

**Backend**:
- `GET /api/assessment-templates/[id]/longitudinal?organizationId=…` — coach can query if they own the org (canAccessOrganization); admin/staff bypass. 400 if organizationId missing; 401/404/200 otherwise.

**UI**:
- `/portal/assessments/trends` server page — selectors form if templateId/organizationId not yet picked; otherwise fetches via service helper and hands off to client component.
- `CampaignTrendsView` client component — three states:
  - **Zero campaigns**: empty card linking to `/portal/assessments/new`.
  - **Single campaign**: stats card + banner "Trends require 2+ campaigns for the same template + org. Run another to see comparison."
  - **Multi-campaign (≥2)**: SVG composite-score line chart (X=campaign openAt, Y=mean countAchieved) with dots + axis labels; per-section trend table (rows S1–S10, columns = campaigns, cells color-shaded green/yellow/red by improvement vs prior campaign); collapsible per-question sparkline grid (40 mini-charts for Rockefeller).
- "View Trends" link added to `/portal/assessments/[id]` (Task F detail page) — deep-links with prefilled templateId + organizationId.

**Type addition**: `CampaignOverview.campaign` gains `templateId` + `organizationId` (purely additive; needed for the deep-link).

**Tests**: 19 new across 3 suites (trends service 9 + longitudinal route 5 + CampaignTrendsView component 5). Full suite: 1622 passing (was 1603), zero regressions. `CI=true npx next build --turbopack` green locally.

**Deferred to v1.5** (per spec, locked decisions):
- Team/participant filter dropdown (team-slicing is v1.5 across all surfaces, same as aggregate report)
- TEXT / NUMBER / COMPOUND question-type panels (only Rockefeller exists today; those types ship with Vision Alignment / QSP v2 seed when Jeff signs off content)
- YoY / QoQ delta cards

---

### 2026-05-18 — Assessment Tool v7.6 — Task G admin AccessGroup management UI (closes ops gap; wires Wave 5 wireframes 21 + 22 to real product): <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-task-g-access-group-ui -->

Admin can now create, edit, archive AccessGroups and add/remove coaches + templates via the app — no more manual scripts. Wires Wave 5 wireframes 21 (list) + 22 (detail with evaluateAccessChange preview) into the real product on top of Task A's service-layer transactional guard.

**Backend** (9 new admin-only routes; every membership mutation routes through `evaluateAccessChange` inside `$transaction` for advisory lock + SELECT FOR UPDATE + audit):
- `POST/GET /api/admin/access-groups` — create + list (with `?includeArchived=true` to include soft-deleted)
- `GET/PATCH /api/admin/access-groups/[id]` — detail (with `_count` + populated joins) + name/description update
- `POST /api/admin/access-groups/[id]/archive` — soft-delete
- `POST/DELETE /api/admin/access-groups/[id]/coaches[/coachId]` — add/remove coach membership; DELETE returns 409 BLOCKED_ZERO_ACCESS with diff payload unless `?force=true&forceReason=…`
- `POST/DELETE /api/admin/access-groups/[id]/templates[/templateId]` — add/remove template; same BLOCKED_ZERO_ACCESS + force pattern
- `POST /api/admin/access-groups/[id]/preview-change` — DRY-RUN endpoint that wraps `evaluateAccessChange` in a rolled-back transaction; returns the per-coach BEFORE/AFTER diff for the UI to render in a modal BEFORE the actual mutation; writes no audit logs
- `GET /api/admin/coaches` — autocomplete with `?search=…` + `?excludeGroupId=…`

**UI**:
- Added `Access Groups` entry to admin sidebar (adjacent to `Aggregate Report`)
- `/admin/access-groups` — list table (Name | Description | Coach count | Template count | Updated | Manage chevron) + create dialog + show-archived toggle + INTERSECTION info banner
- `/admin/access-groups/[id]` — detail page with metadata card, coaches table, templates table, Add buttons opening autocomplete dialogs, archive button
- `AccessGroupPreviewModal` — two-stage flow: stage 1 shows per-coach BEFORE/AFTER effective-template diff (red-highlight coaches dropping to zero); stage 2 (only on 409 BLOCKED_ZERO_ACCESS) requires non-empty forceReason free-text and re-calls with `?force=true`
- `CoachAutocomplete` + `TemplateAutocomplete` — reusable type-ahead pickers

**Tests**: 35 new across 6 suites. Full suite: 1603 passing (was 1568), zero regressions. `CI=true npx next build --turbopack` green locally.

**Deferred to v1.5** (per spec):
- Archive/undelete/hard-delete with full evaluateAccessChange preview UX (current archive button does plain soft-delete; full preview ships when archive UX is designed)
- Bulk-add certified coaches affordance from wireframe 22 (separate confirmation/preview flow needed)
- Click-to-edit inline metadata (shipped as `Edit Metadata` dialog instead per shadcn idiom)

---

### 2026-05-18 — Assessment Tool v7.6 — Implementation arc Tasks A–F (service layer → coach portal → INVITED flow → admin aggregate → campaign detail): <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-implementation-tasks-a-f -->

Full v1 INVITED loop now operational on prod. Coach creates an organization, runs the 5-step campaign wizard, activates a Rockefeller campaign, respondents get magic-link emails, fill the 40-question survey, submit, scoring runs server-side and stores a frozen `result` JSON, coach views completion + inline results on the campaign detail page, admin sees aggregate stats across all submissions.

**Task A — Service-layer foundation** (commit `62c7af3`):
- `lib/auth/coach-status.ts` — `CERTIFIED_STATUS = "ACTIVE"` canonical constant + `isCertified()` helper
- `lib/auth/access-policy-version.ts` — runtime `ACCESS_POLICY_VERSION` env reader (intersection | union | shadow-union)
- `lib/assessments/errors.ts` — typed error classes with `code` discriminators (no HTTP coupling)
- `lib/assessments/access-control.ts` — `canAccessTemplate` (INTERSECTION), `canAccessOrganization`, `canCreateCampaign`, `canManageCampaign`
- `lib/assessments/evaluate-access-change.ts` — pre-save guard with `pg_advisory_xact_lock` + SELECT FOR UPDATE + BLOCKED_ZERO_ACCESS path
- `lib/assessments/transfer-ownership.ts` — admin org transfer with cascading campaign updates + `OrganizationOwnershipEvent` audit
- 72 new tests (5 suites)

**Task B — Organization + Team + Respondent CRUD APIs** (commit `c80540c`):
- 13 endpoints under `/api/organizations/...` (orgs + nested teams + nested respondents).
- `POST /organizations` resolves coach from actor.coachId, sets `ownerCoachId` self. Admin/staff list all; coach lists owned only.
- Composite dedupe for OrgRespondent via `(organizationId, dedupeSource, dedupeValue)`; P2002 → 409 with existing id.
- Team tree-shape listing; cycle detection on PATCH parentTeamId; refuse DELETE on parents of non-deleted children.
- `canAccessOrganization` returns 404 (not 403) on auth-fail to prevent ID enumeration.
- 52 new tests (3 suites)

**Hotfix #1** (commit `6b63783`): Prisma `Sql` arg vs tagged-template — Task A's `tx.$executeRaw(Prisma.sql\`…\`)` failed Vercel's strict Turbopack TS. Switched 5 call sites to tagged-template `tx.$executeRaw\`…\``. Test mocks hid the type error; only `next build` caught it.

**Task C — Coach portal + 5-step campaign wizard** (commit `1d7e452`):
- Added `Assessments` entry to coach portal sidebar (between My Workshops + Registrations).
- `/portal/assessments` landing page — empty-state CTA + table of this coach's campaigns.
- `/portal/assessments/new` — 5-step wizard (Organization → Template → Participants → Schedule → Review). Steps 0 and 2 have inline `+ New …` forms so the coach can seed org + respondents without leaving the wizard.
- Backend: 5 new routes (`POST/GET /api/assessment-campaigns`, `GET/PATCH /api/assessment-campaigns/[id]`, `POST/DELETE /api/assessment-campaigns/[id]/participants`, `POST /api/assessment-campaigns/[id]/activate`, `GET /api/assessment-templates` INTERSECTION-filtered).
- Step 1 template list is server-side filtered via `canAccessTemplate` — never exposes unfiltered list to client.
- CEO uniqueness enforced via Zod (refuses 2+ in payload) + service-layer swap in same tx when re-assigning.
- 44 new tests (5 suites)

**Task D — INVITED participant magic-link flow** (commit `0820234` + hotfix `58fd1ec`):
- Iron-session cookie auth, path-scoped to `/org-survey/${campaignAlias}`, ttl 1800s. `ASSESSMENT_SESSION_SECRET` provisioned in Vercel prod env.
- Token helpers: random 32B base64url; sha256 stored to DB; `crypto.timingSafeEqual` compare; token in URL fragment (`#t=…`), client clears via `history.replaceState`.
- `POST /api/assessment-campaigns/[id]/invite` — idempotent batch (cap 25); sends via existing SMTP transport; PENDING→SENT on 2xx.
- `POST /api/assessment-campaigns/[id]/invitations/[iid]/resend` — same token (no rotation), increment resentCount.
- 4 public routes under `/org-survey/[campaignAlias]/`: page.tsx (client) + exchange/me/submit/thank-you.
- Lifecycle gate on every cookie-bearing route (re-fetch invitation + campaign each call; 410 on revokedAt, expired, SUBMITTED, status≠ACTIVE, time-window miss).
- Strict v6.6 answer validation; `SELECT FOR UPDATE` on submit; 409 on double-submit; calls `scoreSubmission()` and stores frozen `result`.
- Middleware allowlist updated at BOTH insertion points (authorized callback + body allowlist).
- `Cache-Control: no-store` + `Referrer-Policy: no-referrer` on the survey page; no-store on the 3 JSON responses.
- 37 new tests (5 suites)
- Hotfix: `org-survey-client.tsx` was untracked in the initial commit; `next build --webpack` lazy-resolved it locally, Turbopack on Vercel failed fast.

**Task E — Admin aggregate dashboard** (commit `bd713f2`):
- New `Aggregate Report` nav entry in admin sidebar (between Surveys + Files).
- `/admin/assessments/aggregate` page — template + version selectors only (MVP scope per locked decision 8; time-range / group / per-org filters deferred to v1.5).
- Yellow info banner: "Admin bypasses CEO_ONLY anonymity in aggregate" (operator-mode bypass).
- 4 stat cards + tier histogram (semantic-token colored bars) + per-section means table + SVG sparkline of submissions over time + empty state.
- Reads `submission.result` (frozen at submit) — no recomputation.
- 3 admin-only API endpoints (`/api/admin/assessments/aggregate`, `/api/admin/assessment-templates`, `/api/admin/assessment-templates/[id]/versions`).
- Service helper `lib/assessments/aggregate-report.ts` does in-memory aggregation (fine for v1 scale).
- 17 new tests (4 suites)

**Task F — Coach campaign detail page** (commit `88c6d91`):
- Replaced placeholder `/portal/assessments/[id]` with the real daily-ops surface.
- Overview card (campaign name + status pill + template + org + schedule + stats: totalParticipants / invited / viewed / submitted / completionPct).
- Respondents table — per-row participant + invitation status pill + sent/submitted timestamps + CEO badge + actions.
- "View results" action lazy-loads `submission.result` from a new GET endpoint and inline-expands `<AssessmentResultView>` panel (tier banner + per-section table + per-question collapsible detail).
- "Resend invite" action wires existing resend route (only enabled for PENDING/SENT/VIEWED, not revoked; double-click protected; optimistic resentCount bump).
- Service helper `lib/assessments/campaign-detail.ts` — pure aggregation against a narrow Db interface (testable, no DB). Revoked invitations excluded from "invited" stat but still surfaced in the row for future revoke-affordance.
- 2 new admin-only API routes (`/api/assessment-campaigns/[id]/respondents`, `/api/.../respondents/[rid]/result`) — 404 (not 403) on auth-fail to prevent campaign-ID enumeration.
- 31 new tests (4 suites)

**Tests**: 1568 passing across 184 suites (up from 1310 on the foundation-slice commit). 213 new tests added over Tasks A–F. Zero regressions.

**Discipline lesson banked**: pre-push gate is now `CI=true npx next build --turbopack` (matches Vercel's pipeline). Plain `next build` can lazy-resolve missing modules via webpack and pass locally while Turbopack on Vercel fails fast. Memory entry: `feedback_turbopack_build_gate.md`.

**Deferred to v1.5** (per spec):
- Results-emailed-back to respondent (`sendAssessmentResultsEmail`) — gated on Jeff's `INVITED_RESULTS_EMAIL_COPY_APPROVED` content-flag sign-off
- Inngest async send (v1 uses sync SMTP)
- Admin AccessGroup management UI (Wave 5 wireframes 21 + 22)
- PUBLIC participant flow (`/quiz/[alias]` — Website Assessment + SunHub)
- Conditional report sections + peer benchmarks (Scaling Up Assessment)
- Wave 3 wireframes (output/report screens) — Jeff's stated next design priority
- Trends / longitudinal page

---

### 2026-05-18 — Assessment Tool v7.6 — Foundation slice + spec library + prod DB rebuild: <!-- ENTRY_ISO:2026-05-18 ENTRY_SLUG:assessment-v7-6-foundation-spec-library -->

Assessment Tool v1 foundation (Issue #10) shipped end-to-end across two sessions (May 14 Tasks 0-4 + May 17/18 Tasks 5-9), reviewed across 6 rounds of Codex adversarial review.

**Spec library** (NEW at `docs/specs/v7.6/`, ~795 lines): 01-schema, 02-service-layer-rules (INTERSECTION RBAC, `evaluateAccessChange`, `canCreateCampaign`, ownership transfer, `ACCESS_POLICY_VERSION` env flag), 03-seed-rockefeller (`resolveSystemUser`, advisory lock, 6 states), 04-deploy-runbook (mandatory `dotenv-cli`, DB fingerprint, `prisma migrate diff` baselining, PITR), 05-wireframes-wave5 (Wave 2 revisions + Wave 5 deliverables), 06-observability (7 metrics, 6 alerts, `/admin/observability`), 07-bootstrap-runbook, operator-task-9-steps.

**PLAN.md** restructured from a 3,200-line monolith into a 70-line hub. Pre-v7.6 history archived to `plans/history/v6-v7.5-archive.md` (2,541 lines). Discipline: future spec revisions land in the appropriate spec file under `docs/specs/v7.6/`, NOT in PLAN.md.

**Schema migration** `20260514230000_add_assessment_infrastructure_v7_5` (amended in place v7.5 → v7.6) — 13 new tables, greenfield additive (zero new columns on existing tables):
- `Organization` (+ `ownerCoachId` NOT NULL per Jeff May 15 hierarchy flip — coaches own organizations directly)
- `OrgTeam` (recursive), `OrgRespondent`
- `AssessmentTemplate`, `AssessmentTemplateVersion` (immutable via Postgres trigger), `AssessmentCampaign` (+ `createdByCoachId` for transfer history), `AssessmentCampaignParticipant`, `AssessmentInvitation`, `AssessmentSubmission`
- **`AccessGroup` + `AccessGroupCoach` + `AccessGroupTemplate`** (replaces dropped `TemplateAccessGrant`; INTERSECTION semantics — coach effective access = templates that ALL their groups grant; `ACCESS_POLICY_VERSION` env flag for runtime policy flip / shadow-union mode)
- `OrganizationOwnershipEvent` (audit history for ownership transfers)
- Partial unique indexes (externalId, results-token-hash, single-CEO, access-group-name-where-not-deleted, campaign-respondent-where-respondent-not-null)
- GIN index on `AssessmentCampaignParticipant.teamPathAtAdd`
- **DROPPED** from May 14 v7.5: `OrganizationMembership`, `TemplateAccessGrant`, `OrgMembershipRole` enum (per Jeff May 15 — admins don't manage org memberships; coaches own their orgs)

**Pure scoring function** at `src/src/lib/assessments/scoring.ts` — Zod-typed config, no DB coupling, typed `ScoringValidationError` codes (no HTTP coupling). 25/25 tests green including Rockefeller golden fixture (`countAchieved=37`, `overallTotal=85`, `overallAverage=2.125`, tier="Great").

**Seed** at `src/prisma/seed-rockefeller-assessment.ts` — transactional, advisory-locked, fail-on-mismatch. 6 states (A nothing/B match/C mismatch/D heal/E orphan/F multi). Helpers: `resolveSystemUser`, `ensureAccessGroupAndTemplateLink` (runs on all 3 success paths A/B/D so the "Scaling Up Coaches" → Rockefeller link is idempotent).

**Wave 2 wireframe revisions** (per Jeff May 15 impromptu meeting):
- DELETED `admin/13-admin-memberships.html`
- REVISED `admin/12-admin-user-detail.html` (Memberships card → read-only Owned Organizations list)
- REWROTE `admin/15-admin-template-access.html` (per-coach grants table → Access Groups index with INTERSECTION banner)

**Wave 5 wireframes** (NEW — 4 admin screens, paired markdown spec each):
- `admin/21-admin-access-groups-list.html` + markdown
- `admin/22-admin-access-group-detail.html` (evaluateAccessChange before/after preview, BLOCKED_ZERO_ACCESS path) + markdown
- `admin/23-admin-aggregate-report.html` (MVP: template + version selectors only, no filters on day 1) + markdown
- `admin/24-platform-nav-assessments-entry.html` (Scaling Up top-nav + sidebar transition into Assessments lane) + markdown

**Deploy-safety scripts**: `src/scripts/db-fingerprint.ts` (fails-closed preflight; verifies `ASSESSMENT_PROD_EXPECTED_HOST` matches connected DATABASE_URL host; exit 0 match, 1 config error, 2 mismatch rollback-blocking). `dotenv-cli@^11` added to devDependencies (mandatory env injector; `source`/`set -a` forbidden per spec).

**Production DB rebuilt** (May 18 03:30–04:40 UTC): Free-tier Neon DB was found wiped to a Jan 2026 16-table snapshot (no `_prisma_migrations`, no users, no workshops). Recovery plan: `prisma db push --force-reset` against the empty DB to apply v7.6 schema directly, raw SQL appendix executed via `prisma db execute` (partial unique indexes + GIN index + immutability trigger + function), all 26 historical migrations baselined via `prisma migrate resolve --applied`, full seed cascade (seed.ts → seed-real-data.ts → seed-templates.ts → seed-ev-templates.ts → seed-pre-workshop-survey-template.ts → seed-rockefeller-assessment.ts). End state: 47 tables, 26 migrations baselined, 1 Rockefeller template (alias `RockHabits`, v1 enUS, published, contentHash `46b14e8e…`), 1 AccessGroup (`Scaling Up Coaches` → Rockefeller). Admin login verified via NextAuth (302 → `/admin/dashboard`, session cookie set).

**Tests**: 1310 total passing (up from 1262 on origin/main and 1121 on the May 14 baseline). 48 new lib/assessments tests across 3 suites (scoring, schema-presence, migration-verification — now fully green since prod schema applied).

**Discipline rule (persistent memory)**: `feedback_assessment_spec_library.md` — future Assessment Tool spec revisions land in `docs/specs/v7.6/<NN>-*.md`, never appended to PLAN.md. PLAN.md stays a thin hub.

**Operator notes**:
- Local `.env` was never modified during deploy; `.env.production.local` (gitignored) handles prod commands via `npx dotenv-cli -e .env.production.local -- <cmd>`.
- Neon Free tier is unsafe for production data (6h PITR window; this incident lost ~60 days of test workshops/registrations because no external backups existed). Recommend Pro tier with 7+ day PITR before next deploy.

---

### 2026-05-14 — Round 16 Wave 1 — Affiliate tracking iDev→PAP migration kickoff (cookie-script mount + CSP allowlist + tracker registry foundation, May 14 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-14 ENTRY_SLUG:round-16-wave-1-affiliate-cookie -->

Source: Jeff Verdun's May 14 standing meeting (transcript: https://fathom.video/share/VEQERXhbtBM3TtoJZZRcaai1kZxc9zTi). Jeff asked to move the affiliate cookie-setting script onto the Vercel app's landing pages so direct-link visitors get attribution, and to migrate from iDev to Post Affiliate Pro (PAP) without redeploying everything. Plan written + reviewed by Codex (8 critical findings absorbed) + Superpowers code-reviewer (11 conditions absorbed) before implementation. Plan at `~/.claude/plans/do-we-need-to-cryptic-swan.md`. Executed via SDD workflow: implementer subagent → spec compliance reviewer → code quality reviewer. 18 new tests, 1244 → 1262.

**Architecture: Tracker Registry (Strangler Fig + Adapter pattern).**

Research across migration literature (IREV, Acceleration Partners, Cellxpert, Martin Fowler) converged on parallel tracking during a 4–12 week reconciliation window with the new provider in shadow mode alongside the legacy provider in primary mode — NOT a hard cutover env-var pair. A small `AffiliateTracker` interface (id, mode, getCookieScriptDescriptor, getCommissionScriptDescriptor) lets each provider live in its own adapter file. Registry assembles active trackers from env vars. Modes per tracker: `primary` (live attribution), `shadow` (fires but provider-side flagged as non-payout — verified in merchant dashboard before turning on), `off` (not loaded).

**ScriptDescriptor is a 3-form discriminated union** (`image | externalScript | inlineScriptGroup`) so iDev's current `<img>` pixel form, iDev's URL-based script load, and PAP's library-then-init ordered group pattern can all be represented without races. Wave 1 ships the type but only emits/handles `externalScript` for cookie-setters.

**Wave 1 — Cookie-only mount.** Wave 1 ships ZERO impact on existing iDev `<img>` pixel attribution (CHG-03 path). Legacy `<CustomCodeRenderer>` on thank-you pages unchanged. `interpolateCustomCode`, `validateCustomCode`, `AFFILIATE_PIXEL_HOSTS`, `LandingPage.customCode` schema, Stripe webhook handler — all unchanged.

**Files created:**
- `src/lib/affiliate/affiliate-types.ts` — `TrackerMode`, `ScriptDescriptor` discriminated union, `AffiliateTracker` interface
- `src/lib/affiliate/registry.ts` — `parseMode` (CASE-STRICT lowercase; typos disable rather than fire half-configured), `getActiveTrackers` (per-call env reads — explicit `// DO NOT cache` comment guards against future regression)
- `src/lib/affiliate/idev-tracker.ts` — iDev adapter, cookie-only in Wave 1 (commission descriptor returns `null` stub — tested to guard against accidental Wave 2 leakage)
- `src/components/affiliate/affiliate-cookie-script.tsx` — server component, `next/script` with `strategy="afterInteractive"`, key `affiliate-${t.id}-cookie`, defensive `if (d.type !== "externalScript") return null` skip for forward-prep
- `src/app/(public)/layout.tsx` — NEW file (verified no prior layout in route group). Returns `<>{children}<AffiliateCookieScript /></>`. No `<html>`/`<body>` wrap (root layout owns those). No `metadata` export (inherits from root)

**Routes covered (`(public)/` group, all unauthenticated public surfaces):** `/login`, `/register`, `/workshop/[slug]`, `/w/[slug]`, `/registration/success`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/unauthorized`. **NOT covered (siblings of group):** `/` (redirects to `/login` so cookie fires on redirect target), `/survey/[id]` (post-conversion path).

**Files modified:**
- `next.config.ts` — extended `Content-Security-Policy-Report-Only` `script-src` + `connect-src` with `scalingup.idevaffiliate.com` (Wave 1 iDev) AND `*.postaffiliatepro.com` (forward-prepare Wave 3 PAP). `img-src` deliberately untouched (Wave 2 task — iDev's `image` descriptor renders `<img src>` on `scalingup.idevaffiliate.com` which needs `img-src` allowlist before that path activates).
- `.env.example` — documented 4 new env vars: `AFFILIATE_TRACKER_IDEV_MODE` (default `off`), `AFFILIATE_TRACKER_IDEV_COOKIE_URL`, `AFFILIATE_TRACKER_PAP_MODE`, `AFFILIATE_TRACKER_PAP_COOKIE_URL`.

**18 new tests (4 idev-tracker + 10 registry + 3 affiliate-cookie-script + 1 public-layout):**
- `idev-tracker.test.ts`: cookie descriptor shape when URL set; null when URL is `undefined`; null when URL is `""` empty string (env-var unset-vs-empty deploy footgun guard); commission stub returns null.
- `registry.test.ts`: 10 tests covering case-strict mode parsing ("Primary"/"PRIMARY"/"Shadow"/"SHADOW"/garbage → off); tracker activation by env; PAP block placeholder verified empty for Wave 3 forward-prep.
- `affiliate-cookie-script.test.tsx`: no-trackers → renders nothing; iDev-active → renders `next/script` with correct src and key; skips non-`externalScript` descriptor types (defensive).
- `public-layout.test.tsx`: regression guard asserting `<AffiliateCookieScript />` is mounted by `(public)/layout.tsx` output (catches future-cleanup regression).

**Codex adversarial findings absorbed before code (8 critical reshapes):**
1. `ScriptDescriptor` originally weak single-form union — fixed to 3-form to model real-world tracker shapes.
2. Suppression rule was too aggressive (would kill non-affiliate pixels) — moved to Wave 2 only AND scoped to `primary`+configured.
3. Original Wave 1 included commission+suppression — was hard cutover in strangler-fig costume. Reshaped Wave 1 to cookie-only.
4. Shadow mode underspecified — explicit per-provider verification step added (PAP merchant dashboard MUST confirm non-payout before enabling against production orders).
5. Single global URL-encoding interpolator was context-unsafe (PAP inline JS needs `JSON.stringify`, not percent-encoding). No global interpolator — adapters encode per their own context (`URLSearchParams` for URLs, `JSON.stringify` for inline JS).
6. Coupon capture via Stripe webhook was racy + wrong field. Moved to checkout-creation-time write (Wave 2).
7. Duplicate-fire risk on refresh/back/bookmark unaddressed. Wave 2 adds canonical commission surface per registration + stable `orderNumber = stripeSessionId` for provider dedupe + manual 5×-refresh test.
8. iDev's current production form is `<img>` pixel — adapter originally only supported scripts (would have broken existing iDev attribution). `image` descriptor added to ScriptDescriptor; Wave 2 iDev commission emits `image`.

**Code-reviewer findings absorbed (11 conditions, all signed off):**
- `(public)/layout.tsx` corrected from "Modified" → "New" file in plan.
- Route coverage enumeration explicit (in vs out of `(public)/` group).
- CSP `img-src` task added to Wave 2 with explicit ordering requirement.
- CSP header name verified `Content-Security-Policy-Report-Only` (not `Content-Security-Policy`).
- Empty-string env-var URL test added.
- Case-strict mode parsing test added.
- `public-layout.test.tsx` regression guard added.
- Ad-blocker behavior characterization (uBlock Origin baseline) added to Wave 1 manual acceptance test.
- Authenticated-user no-exclusion note (Wave 2 may add session guard if self-referrals surface).
- Env-var read-timing comment in `registry.ts` (locks against future caching regression).
- "What does NOT change in Wave 1" mechanical enumeration for rollback safety.

**Wave 2-4 roadmap (deferred):**
- Wave 2: commission registry with all three descriptor forms; `Registration.appliedCouponCode` schema (captured at checkout creation, NOT webhook); iDev `image` adapter emit; suppression rule for legacy `<CustomCodeRenderer>` (only when primary+fully-configured); ~22 new tests.
- Wave 3: PAP adapter, shadow mode. Blocked until Jeff invites user as PAP merchant user.
- Wave 4: flip primary to PAP after 4–6 weeks PAP↔iDev variance <1%; deprecate iDev.
- Phase 4 (long-term roadmap): server-side (S2S) postback via Stripe webhook for ad-blocker resilience (15–25% conversion-rate gain per Voluum/Tracknow/RedTrack).

**Wave 1 acceptance test (manual, after deploy):**
1. User fetches iDev cookie-setter script URL from Kajabi site-header settings (admin access granted in meeting).
2. Set `AFFILIATE_TRACKER_IDEV_MODE=primary` + `AFFILIATE_TRACKER_IDEV_COOKIE_URL=<from-Kajabi>` in Vercel; redeploy.
3. Visit a Vercel-hosted public page (e.g. `/login`); DevTools → Application → Cookies → confirm iDev cookie set in first-party storage.
4. Test with uBlock Origin enabled — characterize baseline blocked-rate so post-deploy attribution-shortfall isn't a surprise (legacy `<img>` pixel has same blocker exposure today).
5. Complete the existing register flow on a Lynn workshop URL — legacy `<img>` pixel commission tracking still fires from `LandingPage.customCode`; verify Jeff's iDev dashboard records the conversion correctly.

Direct push to main per Alpha-mode deploy convention. Notion task: https://www.notion.so/3608c45dd829815f8657f7b767253d22

---

### 2026-05-14 — Round 15 — Survey Data Sort/Categorize Tool (Item #5 from Jeff's 5/12 email, May 14 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-14 ENTRY_SLUG:round-15-survey-sort-categorize -->

Source: Jeff Verdun, 5/12 email Item #5 — *"Create a new tool to sort and categorize survey data. Think a screen like financials that allows the sorting of survey data."* Plan written + 2-round adversarial review (Codex + independent self-review caught 5 critical + 4 missing edge cases before any code landed). Executed via SDD workflow: implementer subagent → spec compliance reviewer → code quality reviewer per wave, with targeted polish dispatches when reviewers flagged Important items. 9 commits, 52 new tests, 1192 → 1244.

**Wave 1 — Shared CSV helpers (commit `b4477d9`):**
- New module `src/lib/utils/csv.ts` with two exports: `escapeCsvCell(value): string` (RFC 4180 always-quoted; doubles internal `"`; prepends `'` for cells starting with `=` `+` `-` `@` `\t` `\r` per OWASP injection-defense pattern) and `rowsToCsv(headers, rows): string` (joins with `\r\n`, trailing `\r\n`).
- Refactored `src/app/api/registrations/export/route.ts` to call `rowsToCsv` — replaced ~11 lines of inline escape logic with one helper call. Output is strictly RFC 4180 (every cell now quoted; injection prefix is `'` not `\t`); no existing tests locked the old byte shape; spreadsheet reparse is identical.
- 6 new tests at `__tests__/lib/csv-utils.test.ts` (quote/comma/newline escape, all 6 injection chars, null/undefined → bare empty, Date stringification, RFC 4180 line endings, round-trip reparse).
- Wave 1 code-review deferred items addressed in Wave 5: type-narrow `escapeCsvCell` param from `unknown` → exported `CsvCellInput` union (`string | number | boolean | bigint | Date | null | undefined`); JSDoc clarifying that Date is NOT pre-formatted by the helper.

**Wave 2 — `parseSurveyDateRange` helper + endDate same-day bug fix (commit `cca46ff`):**
- The aggregate page filtered `completedAt` as `lte: new Date("2026-05-13")` = midnight UTC → same-day responses with `completedAt > 00:00` were silently excluded. Fix: new `parseSurveyDateRange(params: { startDate, endDate })` at `src/lib/surveys/survey-types.ts` returns `{ startDate, endDateExclusive }` where `endDateExclusive = new Date(endDate); end.setUTCDate(end.getUTCDate() + 1)`. Query bound switched from `lte` to `lt` (exclusive). Same-day responses now correctly included; month-end (May 31 → Jun 1) + year-end (Dec 31 → Jan 1) rollover tested.
- Migrated `getSurveyResults` in `src/lib/surveys/survey-service.ts` to use the helper. `SurveyResultsFilters.startDate/endDate` widened from `Date` to `Date | string` (back-compat shim; helper-aware string path handles inclusive-of-day correctly).
- Updated `src/app/(dashboard)/admin/surveys/aggregate/page.tsx` to drop inline `new Date(sp.startDate)` and pass raw YYYY-MM-DD strings.
- Bonus: `src/app/api/survey-templates/[id]/results/route.ts` Zod schema migrated from `z.coerce.date()` (which produced midnight UTC at the API surface, same bug) to YYYY-MM-DD regex string. Safe because UI input is `<input type="date">` which always emits YYYY-MM-DD.
- 7 new tests at `__tests__/lib/parse-survey-date-range.test.ts` + 1 updated/added in `__tests__/lib/survey-service-filters.test.ts` (`lte` → `lt` rationale comment).
- Wave 2 code-review Issue 3 (`Record<string, unknown>` → `Prisma.WorkshopWhereInput`) deferred to Wave 6 since Wave 6 rewrites that page.

**Wave 3 — `getSurveyResponseRows` service helper (commits `d927268` + polish `0f2f5e5`):**
- New exported function `getSurveyResponseRows(templateId, filters, options?: { cap?: number | null })` returning `{ template, questions, rows, totalCount, cappedAt }`. Single backbone consumed by both the new UI table (Wave 4) and the CSV export endpoint (Wave 5). Existing `getSurveyResults` UNTOUCHED (different responsibility — aggregate stats vs per-response drill-down).
- **Codex-critical fix:** Workshop→Category relation is `workshopCategory` (Prisma `@relation`), NOT `category` (legacy `WorkshopCategory @default(AI)` enum). The plan originally used `category` and would have crashed at runtime. Test asserts `call.include.workshop.select.workshopCategory).toBeDefined()` AND `call.include.workshop.select.category).toBeUndefined()`.
- Default cap `ROW_CAP = 500` for UI; pass `{ cap: null }` for unbounded CSV export. `cappedAt` is set ONLY when truncation actually occurred AND `totalCount > cap`.
- Each row's `answersByQuestionId: Map<questionId, { value, numValue }>` built in-memory from the include payload for O(1) per-cell lookup in the table/CSV.
- `coach.name`: null-safe trim of firstName+lastName; empty → `null`. `category`: from `workshopCategory` relation; `null` when workshop has no `categoryId`.
- Throws `Error("Survey template not found: ...")` on missing template — deliberate choice over silent null-return to surface consumer bugs (stale templateIds in URLs, deleted-template races).
- Polish commit applied 3 reviewer-flagged fixes: (1) `Promise.all([template, count, findMany])` parallel fetch (was sequential — 3 round-trips → 1); (2) `cappedAt` now uses pre-filter `surveys.length` not post-filter `rows.length` (defensive in-memory filter could have hidden a true cap); (3) `respondent: { firstName, lastName, email } | null` field added (registration-linked surveys — powers Wave 5 CSV identification).
- 12 new tests at `__tests__/lib/survey-response-rows.test.ts` (9 in original commit + 3 in polish). Covers all 6 spec acceptance bullets + null-coach/null-category fallback + template+question ordering + parallel-fetch invariant + respondent shape.

**Wave 4 — `<SurveyResponsesTable>` client component (commits `6f196b4` + polish `8a4df5e`):**
- New `"use client"` component at `src/components/surveys/survey-responses-table.tsx`. Renders per-response rows with sortable column headers, conditional answer columns, empty state, cap banner, Export CSV button.
- **Always-shown columns:** Workshop (Next.js `<Link>` to `/workshops/<id>`), Workshop Code, Coach, Category, Completed At.
- **Conditional columns:** NPS Score (when `surveyType === "NPS"` OR any row has numeric NPS answer); Avg Rating (when any RATING-type `numValue` present; per-row cell = mean rounded to 1 decimal); Comment (when any TEXT/TEXTAREA non-empty value; per-row cell = first such answer truncated to 60 chars + ellipsis).
- **Sortable:** local `useState` for `sortKey + sortDir`. Default `completedAt DESC` (matches server-side `findMany`). First click on a different column resets to ASC; subsequent clicks toggle ASC↔DESC. Stable sort via `[...rows].sort()` (V8 Array.sort is stable). Nulls last in ASC, first in DESC.
- **Empty state:** "No responses match these filters." with widen-filters hint.
- **Cap banner:** "Showing N of M responses — narrow filters or use Export CSV to see all." rendered above the table when `cappedAt !== null`.
- **Anti-feature confirmed:** NO "Respondent" column — PII stays in CSV-only territory (the `respondent` field on `SurveyResponseRow` is intentionally not rendered; doc-comment at top of file explains why).
- Polish commit applied 3 reviewer-flagged a11y fixes: (1) `aria-sort="ascending|descending|none"` on the active column `<TableHead>` (screen readers can now perceive sort state — the visual `ArrowUp`/`ArrowDown` icons are `aria-hidden`); (2) removed redundant `aria-label` shadowing visible text (was causing "Workshop, Workshop" double-read); (3) tightened fragile test selector from `/Workshop$/i` (substring-anchored) to `/^Workshop$/i` (exact match — won't break if column renamed).
- 9 new tests at `__tests__/components/survey-responses-table.test.tsx` (workshop link href, sort toggle, NPS column hidden when no NPS answers, cap banner gating, empty state, Export CSV href, 60-char truncation, Avg Rating math, aria-sort attribute lifecycle).

**Wave 5 — CSV export endpoint (commits `816e1a5` + polish `3f0048f`):**
- New route `GET /api/survey-templates/[id]/responses/export/route.ts`. Auth chain matches `/api/registrations/export`: `getApiActor` → null → 401; `!isPrivilegedRole(actor.role)` → 403; ADMIN/STAFF → 200. (NOT ADMIN-only per Codex review.)
- Zod-validates query params `coachId`, `categoryId`, `workshopFormat`, `startDate`, `endDate` (YYYY-MM-DD regex). Bad params → 400.
- Internally calls `getSurveyResponseRows(templateId, filters, { cap: null })` for unbounded export. The UI table caps at 500; CSV bypasses it.
- **CSV base columns (in order):** Workshop, Workshop Code, Coach, Category, Format, Survey Type, Respondent Name, Respondent Email, Sent At, Completed At.
- **Per-question columns:** one per question, named after `question.label`, ordered by `sortOrder`. Per-type serialization: TEXT/TEXTAREA raw (no truncation); RATING/NPS numeric (`numValue`); SINGLE_CHOICE label (`value`); MULTI_CHOICE → JSON.parse + `"; "`-joined with comma-split fallback; YES_NO → `"Yes"`/`"No"` mapped from `true/yes/1` and `false/no/0`.
- Filename `survey-<slug>-<YYYY-MM-DD>.csv` via Next.js `Content-Disposition: attachment` (no JS needed for download). Empty-slug fallback `"survey"`.
- Service helper extended (additive only): `SurveyResponseRow.workshop.format: string | null` + `SurveyResponseRow.sentAt: Date | null`. Wave 4's table consumer ignores the new fields (forward-compatible).
- Polish commit applied 3 reviewer-flagged fixes: (1) **404 not 500** on unknown template — wraps the service call in try/catch detecting `Error("Survey template not found")` and returns `404 { error: "Template not found" }` (other errors still throw to default handler); (2) **DRY slug** — replaced the local `slugifyTemplateName()` with `generateSlug` from `lib/utils.ts` (byte-identical output, single source of truth); (3) one-line comment noting `today` uses UTC and may drift up to 5h ahead of admin local time at UTC midnight.
- **Wave 1 deferred items applied:** `escapeCsvCell` param narrowed from `unknown` to new exported `CsvCellInput` union; JSDoc warning Date is NOT pre-formatted. Existing registrations export's call sites still compile (pass only strings/numbers).
- 14 new tests at `__tests__/api/survey-responses-export.test.ts` (13 in original commit + 1 in polish for 404 path). Covers all 8 spec acceptance bullets + per-type serialization + query threading + bad-date 400 + respondent composition + sentAt rendering + 404 on missing template.

**Wave 6 — Aggregate page wiring + Wave 2 Issue 3 leftover (commit `d7ad545`):**
- `src/app/(dashboard)/admin/surveys/aggregate/page.tsx`: added `Promise.all([getSurveyResults, getSurveyResponseRows])` parallel fetch (the row helper takes `coachId`, `categoryId`, `workshopFormat`, `startDate`, `endDate` — `groupBy` is intentionally NOT passed since the per-response view doesn't group).
- New `<section aria-labelledby="individual-responses-heading">` rendered conditionally on `!groupBy && responseRowsData`, positioned AFTER the existing "Per-Workshop Breakdown" table. When `groupBy` is active, the existing groups table covers the categorize intent — flat response table redundant.
- `exportHref` built via `URLSearchParams` preserving all 5 filter keys; no trailing `?` when no filters set. Single Export CSV button rendered exactly once (the table component owns it; no duplicate at section heading per plan).
- **Wave 2 Issue 3 leftover applied:** `workshopSubFilter: Record<string, unknown>` → `Prisma.WorkshopWhereInput`; `completedAtBoundary: Record<string, unknown>` → `Prisma.DateTimeNullableFilter` (canonical types already used in `survey-service.ts:518/523`). Added `import { Prisma } from "@prisma/client"`. Prisma type-check now catches schema drift in the side-breakdown query.
- No page-level tests (high-friction for async server components; no pre-existing tests for this page to extend; underlying pieces — table, helper, route — all already test-covered).

**Test totals:** 149 suites / 1244 tests passing (was 1192 → +52). `CI=true npm run build` clean.

**Scope decisions (Josh, 2026-05-13/14):**
- Item #3 (upload web page templates) **deferred** pending Jeff scoping call — codebase has hardcoded React templates that can't accept arbitrary HTML without major refactor. Concept memo for Thursday meeting: this is "theming" in industry terms (WordPress mental model). Full memo in agent memory.
- Plan reviewed by Codex (5 critical + 1 simplification) + independent self-review (3 issues). All 9 accepted before any code. See plan changelog at `/Users/diushianstand/.claude/plans/do-we-need-to-cryptic-swan.md`.

**Open follow-ons for Beta (not blockers):**
- Streaming CSV for huge exports (current pattern materializes in memory — ~50MB at 10K respondents × 50 questions is still well within Vercel's 1024MB limit; revisit if exports start timing out)
- `@@index on Survey.completedAt` for performant date-range filters at scale
- Multi-dimensional grouping (`groupBy` is single-dimension today)
- Time-series trend chart (avg NPS per month)
- Workshop-to-workshop comparison view
- Response tagging/marking workflow
- `serializeAnswer` extracted to a shared module once a second consumer appears (e.g. preview-before-download)
- `buildExportSearchParams` extracted helper if another page reuses the same filter-preserve pattern

---

### 2026-05-13 — Squash Round 14 — BUG-MAY13-3 (Thank-You Redirect) + BUG-MAY13-2 (Survey View Mismatch) (May 13 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-13 ENTRY_SLUG:squash-round-14 -->

Two bugs filed during Sprint 13 verification, fixed in one push. Plan reviewed by Codex (5 findings accepted before implementation). 7 commits, 26 new tests, 1169 → 1192.

**Wave A — BUG-MAY13-3 (per-workshop thank-you redirect):**
- New helper `resolveRegistrationSuccessUrl` at `src/lib/workshops/thank-you-redirect.ts` resolves post-registration redirect URLs. Uses discriminated union `{ kind: "free"; registrationId } | { kind: "paid"; stripeSessionToken }` to prevent callers from mixing identifiers. Returns `${appUrl}/workshop/<thank-you-slug>` (no query string per Codex review) for free + published THANK_YOU; `${appUrl}/workshop/<slug>?session_id={CHECKOUT_SESSION_ID}` for paid. Falls back to `/registration/success` when no THANK_YOU LandingPage exists.
- New `getAppUrl()` helper colocated in same module returns `process.env.APP_URL || "http://localhost:3000"` — matches sibling-route pattern. Eliminates the divergent `?? NEXTAUTH_URL ?? ""` chain originally introduced in /api/registrations.
- All four registration call sites unified:
  - Public `RegistrationForm` (`(public)/workshop/[slug]/registration-form.tsx`) reads `data.redirectUrl` from POST response and navigates via injectable `navigate()` prop (DI seam for JSDOM testability; defaults to `window.location.href = url`). Defensive fallback to `/registration/success?id=X` if server omits the field.
  - `POST /api/registrations` now returns `redirectUrl` in JSON response body alongside existing fields.
  - `POST /api/workshops/[id]/register` free path (303 redirect Location header) + paid path (Stripe `successUrl` argument) both route through helper. Cancel URL untouched.
  - `POST /api/checkout` migrated from inline `db.landingPage.findFirst` + ternary URL construction (~13 lines) to single helper call. Coupons, Stripe params, cancel URL all unchanged.
- 14 new tests across 3 files: 6 unit tests for the helper (`__tests__/lib/thank-you-redirect.test.ts`), 2 API + 2 component tests for /api/registrations + RegistrationForm, 4 integration tests for /api/workshops/[id]/register.
- Commits: `ea57936` (A1), `6997487` (A2), `64f68e3` (A2 fix — `getAppUrl` extraction), `242970a` (A3), `500e057` (A4).
- THANK_YOU template content gate (pre-implementation): verified `ThankYouPageTemplate` already renders calendar (Google + .ics), workshop date/time/timezone, format, location, and title — registrants lose nothing under the new redirect.

**Wave B — BUG-MAY13-2 (survey-template editor Results tab):**
- Extracted `<SurveyResultsContent>` (pure body) from `<SurveyResultsView>` (page-chrome wrapper). `SurveyResultsView` becomes a thin shell: header + "Back to Workshop" link + mounts `<SurveyResultsContent>`. Public API of `SurveyResultsView` preserved verbatim — workshop-page consumers (admin + coach) untouched.
- `<SurveyResultsContent>` gains optional `showWorkshop?: boolean` prop (default `false`). When `true` and a response has a `workshop` field, renders workshop attribution as a structured `<span>` element next to each respondent — NOT spliced into label strings. Codex anti-splice catch enforced by DOM-node-identity tests (`expect(janeNode).not.toBe(codeNode)`, not just textContent matching).
- Extended `SurveyResultResponse` type with optional `workshop?: { title: string; workshopCode: string } | null` (structurally consistent with existing `registration?: { ... } | null` on same interface).
- Template editor Results tab in `survey-template-editor.tsx` now mounts `<SurveyResultsContent showWorkshop templateGroups={...} />` instead of the deleted `<SurveyResultsPanel>`. Fixes Jeff's 5/12 complaint: "Survey results from the workshop view show correctly. The view from the results button on the survey setup shows differently." Both surfaces now use the same component; the template-editor side additionally shows a workshop column since responses span workshops.
- Fixed Prisma fetch in `admin/surveys/templates/[id]/page.tsx` to include `answers: { include: { question: true } }` in the surveys include — previously missing, would have caused runtime failures when `<SurveyResultsContent>` tried to render per-question per-person results.
- `<SurveyResultsPanel>` (~120 lines) deleted entirely (zero remaining consumers). `useEffect` import dropped from `survey-template-editor.tsx`.
- 7 new tests across 2 files: 4 component tests for `SurveyResultsContent` (structural anti-splice + Wave 12-C regression guard + showWorkshop=false default + empty state), 3 admin tests for template-editor Results tab.
- Commits: `3fccb22` (B1), `1f597fb` (B2).

**Plan validation:** Codex review (`mcp__validate-plans-and-brainstorm-ideas__codex`) found 5 critical issues with the original plan, all accepted before any code was written:
1. Missed `/api/registrations` + `RegistrationForm` client as the actual user-facing path
2. Fake centralization — original plan didn't migrate `/api/checkout` (which already had inline duplicate logic)
3. Speculative `regId` query param work — `/workshop/[slug]/page.tsx` ignores unused query params today
4. Survey-template editor fetch missed `answers` join — `SurveyResultsView` cannot render without answers
5. `SurveyResultsView` is page chrome (has "Back to Workshop" link) — must extract `SurveyResultsContent` body instead of reusing the wrapper

Plan at `~/.claude/plans/do-we-need-to-cryptic-swan.md`. Adversarial-review loop caught issues that would have shipped broken on the original draft.

**Test count:** 1169 → 1192 (+23 new tests). `CI=true npm run build` clean. ESLint clean (2 pre-existing warnings on `survey-template-editor.tsx` for `QUESTION_TYPES` and `SurveyType` unused imports — pre-date Wave B).

**Followups filed (non-blocking, future polish):**
- `/api/survey-templates/[id]/results` route may be orphaned (aggregate page calls `getSurveyResults()` directly, bypassing the HTTP route). Confirm + delete.
- `SerializedSurveyAnswer` type narrower than what the page serializes — tighten serialization or widen type.
- Tombstone comment on the route in `survey-template-editor.tsx` slightly inaccurate.
- Pre-existing ESLint warnings on `survey-template-editor.tsx`.
- Add registrant-level variables to `buildWorkshopVariables()` for THANK_YOU template personalization (deferred from plan).
- iDev pixel firing for free-workshop thank-you pages (deferred from plan).
- Consolidation of `/admin/surveys/aggregate/page.tsx` with the template-editor Results tab (likely redundant after Wave B).

---

### 2026-05-13 — Sprint 13 Follow-ons — DTSTART Fix, Virtual Format Defaults, ICS Directions Suppression (May 13 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-13 ENTRY_SLUG:squash-round-13-followon -->

**Sprint 13 Follow-ons — DTSTART, Virtual Default, ICS Directions** (May 13 2026, direct push to main, Alpha mode):
Source: live QA of Squash Round 13 revealed 3 new bugs. 1148 → 1169 tests (+21).

**ICS DTSTART Minutes Fix** (`8583ec3`):
- `split(":")` on range `eventTime` like `"14:30 - 16:00"` yielded NaN for minutes, silently truncating calendar invite start to 14:00.
- `parseStartTime(eventTime: string)` helper: strips range suffix via `/\s*[-–]\s*.*/`, then splits. Used in `generateIcsContent` and `buildGoogleCalendarUrl`.
- 7 new tests in `ics-generator.test.ts` (14 → 17 in that file, 1148 → 1155 total).

**Virtual Format Default — Admin + Resubmit + Inline Forms** (`3c993e5`):
- Wave 12-A only patched `WizardContext.tsx` (coach portal). Admin `new/page.tsx:138` had own `useState({ format: "IN_PERSON" })`. `resubmit-workshop.tsx` and `WorkshopInlineEditForm.tsx` had same `|| "IN_PERSON"` fallback.
- 3 one-line `IN_PERSON → VIRTUAL` changes; 3 new regression test files (4 tests).
- 1155 → 1159 tests total.

**ICS LOCATION Triggers Gmail Directions Button on Virtual Workshops** (`9167b26`):
- `buildLocationString` returned `workshop.virtualLink || "Virtual Workshop"` for VIRTUAL, populating ICS `LOCATION:` field — Gmail uses this to render a "Directions" button in calendar invite preview.
- Fix 1: `buildLocationString` returns `""` for VIRTUAL (and HYBRID with no venue).
- Fix 2: `buildIcsDescription(workshop)` helper appends `"\n\nJoin online: <link>"` for VIRTUAL/HYBRID; used in `handleRegistrationCreatedFree` and `process-payment-completed-helpers`.
- 10 new tests in `ics-generator.test.ts` (17 → 27); mocks updated in 2 handler test files.
- 1159 → 1169 tests total.

**BUG-MAY13-3 filed** (not yet shipped):
- `/registration/success` hardcoded redirect bypasses per-workshop thank-you template system. Root cause: template upload/download feature surfaced the disconnect; sprint focus shifted to email/ICS critical bugs. Fix A queued: `register/route.ts` redirect to per-workshop thank-you slug with `?regId=X`.

### 2026-05-12 — Squash Round 13 — Registration Email + ICS + Survey Pinning + Refund Hint (May 12 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-12 ENTRY_SLUG:squash-round-13 -->

**Squash Round 13 — Registration Email + ICS + Survey Pinning + Refund Hint** (May 12 2026, direct push to main, Alpha mode):
Source: Jeff Verdun email + Slack follow-ons from May 12. All Notion tasks created before implementation and assigned to gabriel@chiefaiofficer.com. 1121 → 1148 tests (+27).

**Wave 13-A — Registration Email Fix:**
- Removed legacy `"send-registration-email"` Inngest step from `schedule-emails.ts` — was firing an old Azure template for ALL registrations, causing PAID double-send.
- Extended `RegistrationConfirmationContext` with `format`, `virtualLink`, `venueName`, `venueAddress` fields.
- `buildLocationBlock()` helper in `transactional-email-template.ts`: VIRTUAL+virtualLink → join link (https-only scheme guard); IN_PERSON/HYBRID+venue → Get Directions (uses `buildLocationString` for Maps query, not raw JSON).
- `sendPaidRegistrationNotificationStrict` + `sendNotificationWithAtomicClaim` thread all 4 location fields.
- New `handleRegistrationCreatedFree` Inngest function on `registration/created` event: skip conditions (not_found, paid_path_handles, pre_cutoff, already_sent, race_lost), atomic claim pattern, ICS generation, SMTP rollback on failure.
- `REGISTRATION_HANDLER_CUTOFF_AT` env var (documented in `.env.example`) controls which free registrations the handler processes.
- `/api/workshops/[id]/register` route: removed fire-and-forget `sendRegistrationNotification`; now publishes `registration/created` to Inngest for FREE workshops.
- 15 new tests across `handle-registration-created-free.test.ts` (8) + `transactional-email-template.test.ts` (3) + `workshop-register.test.ts` (4 updated).

**Wave 13-B — ICS End-Time Fix:**
- `parseDurationHours` extended: numeric-prefix regex (`"2 hours"` → 2, `"3 hours"` → 3), explicit `"8hr"`/`"4hr"` branches, `"full"` → 8, fallback changed from 8 → 2.
- `parseDurationHoursFromEvent(duration, eventTime)` implemented: parses `"HH:MM - HH:MM"` (hyphen or en-dash) to derive duration from range; falls back to `parseDurationHours`.
- All 5 remaining bare `parseDurationHours` callers migrated: `api/workshops/[id]/ics/route.ts`, `workshop-date-change.ts`, `thank-you-page-template.tsx`, `registration/success/page.tsx`, `process-payment-completed-helpers.ts` (already migrated in 13-A).
- 11 new tests in `ics-generator.test.ts`.

**Wave 11-G — Survey Template Pinning:**
- `getOrCreateSurveyLink` in `survey-automation.ts` (line ~67): removed `isActive: true` from pinned-template lookup. Auto-attach paths keep `isActive: true`.
- Workflow editor `StepCard` + `NewStepForm` state type updated to include `isActive: boolean`. Picker renders `(inactive)` suffix for inactive templates. Empty-state text changed to "No survey templates."
- 5 new tests: `survey-automation-pinned.test.ts` (3) + `workflow-editor-survey-picker.test.tsx` (2).

**Wave 13-C — Refund Screen Stripe ID Hint:**
- `mark-refunded-button.tsx` prompt string updated: removed misleading "replace pi_ with re_" tip (Stripe refund IDs are separate objects). New text directs operators to Payments → [charge] → Refunds in Stripe dashboard. Validation regex (`/^re_[A-Za-z0-9]{14,}$/`) unchanged.

### 2026-05-12 — ENH-MAY12-2 — Survey Step Email Customization Fix (May 12 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-12 ENTRY_SLUG:enh-may12-2-survey-step-fix -->

**ENH-MAY12-2 — Survey Step Email Customization Fix** (May 12 2026, direct push to main, Alpha mode):
- Jeff reported: "The surveys if you make them as templates you do not have any control over the email that comes with it."
- Root cause: `StepCard` initialized `templateId` from `step.emailTemplateId` even for `SEND_SURVEY_LINK` steps — a stale `emailTemplateId` in the DB (or set by switching from another step type) caused `{!templateId && ...}` block to hide the subject/body fields.
- Fix 1: `StepCard` `useState` initializer clears templateId when `step.stepType === SEND_SURVEY_LINK`.
- Fix 2: `StepCard` step-type onChange clears `templateId` when switching TO `SEND_SURVEY_LINK`.
- Fix 3: `NewStepForm` step-type onChange clears `templateId` when switching TO `SEND_SURVEY_LINK`.
- Fix 4: Both submit handlers validate that non-blank body includes `{{surveyUrl}}` — destructive toast + early return if missing (blank body allowed = uses default email).
- Fix 5: Help text added below body textarea in both forms when `stepType === SEND_SURVEY_LINK`.
- New test file `__tests__/components/workflow-editor-survey-email.test.tsx` (7 RED→GREEN tests).
- 1121 tests passing (up from 1114).

### 2026-05-12 — Squash Round 12 — Jeff May 12 Follow-On Items (May 12 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-12 ENTRY_SLUG:squash-round-12 -->

**Squash Round 12 — Jeff May 12 Follow-On Items** (May 12 2026, direct push to main, Alpha mode):
Source: Jeff Verdun email "Bug List/Improvement List 5/12/26". Wave 11 already shipped double-email + format-default fixes. Wave 12 + Wave 8-D cover the remaining items. 1030 → 1114 tests (+84).

**Wave 12-A — Password UI Label Fix:**
- Password hint text in 3 UI surfaces corrected from "12 characters" → "8 characters" to match the Zod schema `.min(8)` already enforced since Sprint 1.
- Files: `app/(public)/register/page.tsx`, `components/auth/change-password-form.tsx`.
- New test file `__tests__/auth/password-hint-text.test.tsx` (2 RED→GREEN render tests).

**Wave 12-B — Coach Integration IDs:**
- `hubspotId` and `circleId` were in the Prisma schema (`Coach` model, both `String? @unique`) but not exposed in any UI.
- Admin coach create form (`coaches/new/page.tsx`) and edit form (`coaches/[id]/edit/page.tsx`) now show editable "HubSpot Contact ID" + "Circle Member ID" text inputs via new `allowEditIntegrationIds?: boolean` prop on `CoachProfileForm`.
- Coach portal settings page shows both IDs as read-only monospace text (no editing — protects HubSpot/Circle sync integrity).
- API PATCH `api/coaches/[id]/route.ts`: coach session → 403; Prisma P2002 unique constraint on either ID → 409 with message "This HubSpot/Circle ID is already assigned to another coach".
- New test file `__tests__/api/coach-integration-ids.test.ts` (3 tests: admin 200, coach 403, duplicate 409).

**Wave 12-C — Survey Per-Person Ratings:**
- `SurveyResultsView` (per-workshop view) now lists individual respondent ratings below the average for RATING/NPS questions. Uses existing `formatRespondentLabel()` helper (full name → email → "Anonymous"). Denominator: `/5` for RATING, `/10` for NPS.
- `SurveyResultsPanel` (template editor aggregate view) distribution histogram was already implemented — 12-C-2 was a no-op.
- New test file `__tests__/surveys/survey-results-per-person.test.tsx` (4 tests: named respondents, anonymous, email-only fallback, empty state).

**Wave 12-D — Admin Approvals Price Display** (May 12 2026, direct push to main, Alpha mode):
- Admin approvals list for CUSTOM_PRICING now shows both "Original" and "Requested" prices for easy comparison.
- **Original price source priority:** (1) `requestData.oldPriceCents` (snapshot stored at request time), (2) fallback to live `workshop.priceCents`.
- Include pricing tier name when available: "Original: $X (Tier Name)".
- API route `/api/approvals` now includes `workshop.priceCents` + `workshop.pricingTier.name` in Prisma select.
- Approval interface extended with optional `workshop` property carrying pricing data.
- CUSTOM_PRICING badge changed from showing the price to generic label "Custom Price Requested".
- New test file `__tests__/admin/custom-price-approval.test.tsx` (5 tests covering fallback logic, tier display, both price lines, non-CUSTOM_PRICING no-op).
- 1114 tests passing; build succeeds.

### 2026-05-12 — Wave 8-D — HubSpot coach_contract_status auto-approval (May 12 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-12 ENTRY_SLUG:wave-8-d-hubspot-auto-approve -->

**Wave 8-D — HubSpot coach_contract_status auto-approval** (May 12 2026, direct push to main, Alpha mode):
- New `getHubSpotCoachContractStatus(hubspotContactId)` exported from `services/hubspot.ts`: calls `basicApi.getById` with `["coach_contract_status"]` property, returns `string | null`, throws on API error (fail-closed).
- New `evaluateHubSpotAutoApprove()` private helper in `lib/approval-engine.ts` inserts before the Circle cert check for `WORKSHOP_REQUEST` type. Three safety levers: `HUBSPOT_AUTO_APPROVE_ENABLED="true"` kill switch (default off), `HUBSPOT_AUTO_APPROVE_SHADOW="true"` log-only mode, `HUBSPOT_AUTO_APPROVE_ALLOWLIST="a@b,c@d"` comma-separated email allowlist. API error → `console.error` + return `{ autoApproved: false, reason: "hubspot_api_error: ..." }` (fail-closed, no DB write).
- Auto-approve path: creates ApprovalQueue row (PENDING), updates it to APPROVED with `respondedBy: "system:hubspot-coach-status"`, writes AuditLog row, emits `workshop/approved` Inngest event.
- `ApprovalEvaluationInput` gains optional `hubspotId?: string` field.
- `api/approvals/route.ts` coachBio select now includes `hubspotId: true` and passes it to `evaluateApproval`.
- 9/9 RED→GREEN tests at `__tests__/lib/hubspot-approval-engine.test.ts` (all 9 safety-lever scenarios).
- 1114 tests passing (up from 1105).

**v2.5 Sprint — COMPLETE** (May 8 2026 + Wave 6 May 10): 13 tickets shipped across 6 waves over three sessions. Direct push to main, Alpha mode. Test count 964 → 1021 (+57). Sprint plan: `~/.claude/plans/do-we-need-to-cryptic-swan.md`. Sprint ledger with full per-wave impl details: `plans/JEFF_MAY6_SPRINT.md`.

### 2026-05-11 — BUG-MAY11-1 — workshop PATCH never persisted stripePromotionCodeId (May 11 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-11 ENTRY_SLUG:bug-may11-1-stripe-promotion-id -->

**BUG-MAY11-1 — workshop PATCH never persisted stripePromotionCodeId** (May 11 2026, direct push to main, Alpha mode):
- Surfaced during the v2.5 end-to-end verification sweep. ENH-MAY6-7 (Wave 3 dollar-amount coupons) shipped with passing unit tests for `services/stripe.ts createWorkshopPromotionCode` (Stripe API call shape) but the integration was never exercised end-to-end. Saving any new coupon via the admin workshop edit form returned PATCH 200, but the public registration → Stripe Checkout flow rejected the code with "Discount code is invalid or expired" (POST `/api/checkout` → 400 `StripeDiscountCodeError`). Affected BOTH PERCENT and AMOUNT coupons — Stripe-side promotion code WAS created, the platform just never wrote the returned `stripePromotionCodeId` back into `Workshop.coupons`. Checkout-time validator read all-null `stripePromotionCodeId` from stored coupons → `allowedPromotionCodeIds` empty → reject.
- Fix at `src/app/api/workshops/[id]/route.ts`: Stripe sync moved BEFORE the workshop.update (was a fire-and-forget block after). Each parsedCoupon's Stripe call result is merged back via `{ ...coupon, stripeCouponId, stripePromotionCodeId }` so the `serializeWorkshopCoupons(parsedCoupons)` written to DB carries the IDs. New pre-pass diff-checks each incoming coupon against `parseStoredWorkshopCoupons(existing.coupons)` and reuses existing `stripePromotionCodeId` when `code + discountType + discountPercent + discountAmountCents + singleUse` are unchanged — prevents orphaning a fresh Stripe promo code on every re-save (e.g. when the admin edits only the title).
- 6/6 tests passing in `__tests__/api/workshop-coupons.test.ts`: existing-save-shape test updated to reflect the new merge; 3 new tests added (persist new ID, reuse existing ID on unchanged shape, recreate on changed shape). Full suite 1030/1030 (up from 1027).
- Operator follow-up: the `WAVE6TEST10` Stripe promotion code created during today's reproduction is orphaned in Stripe (not deleted from Stripe's account; just removed from `Workshop.coupons`). Recommend deleting via Stripe dashboard. Pre-fix promo codes for historical coupons may also be orphaned — auditing them is a separate cleanup.

### 2026-05-10 — Wave 6 — BUG-MAY6-9 + finalizeParentRollup wiring (May 10 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-10 ENTRY_SLUG:wave-6-bug-may6-9-rollup -->

**Wave 6 — BUG-MAY6-9 + finalizeParentRollup wiring** (May 10 2026, direct push to main, Alpha mode):
- **BUG-MAY6-9** — per-survey respondent attribution. The component `<SurveyResultsView>` shared between admin + coach per-workshop survey results pages was discarding `survey.registration` even though both consumer pages already fetched it via Prisma include. `SurveyResultResponse` interface now carries optional `registration: { firstName, lastName, email } | null`; both consumer pages thread it through; component renders attribution next to TEXT/TEXTAREA answers + a Respondents pill panel mirroring the aggregate-page (ENH-MAY6-8) pattern. Inline `formatRespondentLabel()` helper: trimmed full name → email → "Anonymous". 5 RED→GREEN tests at `__tests__/components/survey-results-view-respondent.test.tsx`.
- **Tier B: link-gen FAILED children + finalizeParentRollup wiring.** `execute-workflow.ts` SEND_SURVEY_LINK now writes a per-recipient FAILED child row (`errorMessage: "link_generation_failed"`) when `getOrCreateSurveyLink` returns null (was a silent `continue`). Post-loop `finalizeParentRollup(db, executionId)` call added after `recordWorkflowExecution` for SEND_SURVEY_LINK / SEND_FILE_LINK / EMAIL_ATTENDEES — parent now reflects FAILED > SENT > SKIPPED precedence over actual children. Both gated on `executionId` (set by pre-loop `scheduleWorkflowExecution` on the future RELATIVE_TO_EVENT path); the immediate path remains a documented gap until per-recipient idempotency lands in Beta. SEND_FILE_LINK + EMAIL_ATTENDEES rollup is a no-op today (no FAILED children) — enables future SMTP error classification work to flip them on without further wiring. 1 new RED→GREEN test extends `__tests__/inngest/execute-workflow.test.ts`.
- 1021 tests passing (up from 1015).

### 2026-05-10 — Wave 6 follow-on Part 2 — Trigger Now EMAIL_ATTENDEES + SEND_FILE_LINK parity (May 10 2026, commit `d88eb8c`, direct push to main): <!-- ENTRY_ISO:2026-05-10 ENTRY_SLUG:wave-6-followon-part-2 -->

**Wave 6 follow-on Part 2 — Trigger Now EMAIL_ATTENDEES + SEND_FILE_LINK parity** (May 10 2026, commit `d88eb8c`, direct push to main):
- Extends the Part 1 pattern (parent pre-create + per-recipient SENT writes + post-loop update + finalizeParentRollup) to the EMAIL_ATTENDEES and SEND_FILE_LINK handlers in `trigger-workflow-step.ts`. Manual Trigger Now now produces the same audit shape as scheduled fires across all three per-recipient step types.
- Side-effect: fixes latent BUG-MAY4-1b twin on Trigger Now EMAIL_ATTENDEES — the post-loop terminal write was `status: "SENT"` unconditionally, even with 0 registrants. Now `sentEmails.size > 0 ? "SENT" : "SKIPPED"` matching execute-workflow.ts.
- Terminal-auth-error FAILED branches in both handlers now transition the existing parent via `update()` (was a second `create()` that orphaned the SCHEDULED row).
- 3 new RED→GREEN tests + 2 existing tests updated. 1024 → 1027 tests.

### 2026-05-10 — Wave 6 follow-on Part 1 — Trigger Now SEND_SURVEY_LINK parity (May 10 2026, commit `c204dbf`, direct push to main): <!-- ENTRY_ISO:2026-05-10 ENTRY_SLUG:wave-6-followon-part-1 -->

**Wave 6 follow-on Part 1 — Trigger Now SEND_SURVEY_LINK parity** (May 10 2026, commit `c204dbf`, direct push to main):
- Closes Codex round-3 MED 3 from the Wave 6 review. `trigger-workflow-step.ts` (manual Trigger Now path) SEND_SURVEY_LINK handler was diverging from the scheduled `execute-workflow.ts` path: silently `continue`d on `!surveyLink` and wrote no per-recipient rows. On-call manual repro produced different audit data than the scheduled fire that originally failed.
- Fix at `src/inngest/functions/trigger-workflow-step.ts`: (1) Pre-create parent WorkflowStepExecution row with `status: "SCHEDULED"` at top of SEND_SURVEY_LINK handler, capture `parentId`. (2) On `!surveyLink`, call `recordRecipientExecution` with `status: "FAILED"` + `errorMessage: "link_generation_failed"` then continue. (3) After successful SMTP send, call `recordRecipientExecution` with `status: "SENT"`. (4) Replace post-loop `db.workflowStepExecution.create({ data: { status: TERMINAL } })` with `update({ where: { id: parentId } })` — was a second create. (5) Call `finalizeParentRollup(db, parentId)` post-update.
- Scope: SEND_SURVEY_LINK only. SEND_FILE_LINK + EMAIL_ATTENDEES Trigger Now paths still use the old shape — they ship together with the Beta rollup-retry-safety unit once SMTP error classification lands (same scope decision as Wave 6 scheduled-path).
- 3 new RED→GREEN tests + 3 existing tests updated for create→update transition. 1021 → 1024 tests.

### 2026-05-08 — Wave 5 — BUG-MAY6-4a (Notion: [3598c45d…f634](https://www.notion.so/3598c45dd82981c5847fe5be0eb1f634)) — Audit script at `src/scripts/audit-cross-workshop-coupons.ts` lists historical Stripe redemptions where the promo code's `metadata.workshopCode` doesn't match the registration's workshopCode (cross-workshop redemptions before the May 7 fix). Output is CSV to stdout with verdict per row. Read-only / dry-run only. Operator-invoked via `npx tsx scripts/audit-cross-workshop-coupons.ts [--since YYYY-MM-DD] [--limit N]`. Hand-off to Jeff for per-case refund/accept judgment. NO auto-refunds. <!-- ENTRY_ISO:2026-05-08 ENTRY_SLUG:wave-5-bug-may6-4a-audit-script -->

**Wave 5 — BUG-MAY6-4a** (Notion: [3598c45d…f634](https://www.notion.so/3598c45dd82981c5847fe5be0eb1f634)) — Audit script at `src/scripts/audit-cross-workshop-coupons.ts` lists historical Stripe redemptions where the promo code's `metadata.workshopCode` doesn't match the registration's workshopCode (cross-workshop redemptions before the May 7 fix). Output is CSV to stdout with verdict per row. Read-only / dry-run only. Operator-invoked via `npx tsx scripts/audit-cross-workshop-coupons.ts [--since YYYY-MM-DD] [--limit N]`. Hand-off to Jeff for per-case refund/accept judgment. NO auto-refunds.


### 2026-05-07 — Jeff May 6 Workflow Bugs — Complete (May 7 2026, direct push to main, Alpha mode): <!-- ENTRY_ISO:2026-05-07 ENTRY_SLUG:jeff-may6-workflow-bugs -->

**Jeff May 6 Workflow Bugs** — Complete (May 7 2026, direct push to main, Alpha mode):
- Source: Jeff Verdun email "Updated_workflow testing results" (May 6 7:29 PM). Workshop `WS-2026-SVOY` test surfaced two bugs; Codex co-validate caught a third latent bug that ships with the fix.
- **BUG-MAY6-1** (Notion: [3598c45d…81e9](https://www.notion.so/3598c45dd82981e98578c7a6069f4ba4)) — "Standard Test Event" Step 2 (Send Survey Link, **2h before**) fired at 1h before. Root cause: `execute-workflow.ts` iterated `workflow.steps` in `sortOrder` with sequential `step.sleepUntil`. After Step 1's sleep ended at 3 PM, Step 2's scheduled time (2 PM) was already in the past → past-guard fired immediately. New `lib/workflows/order-steps-for-execution.ts` pure helper sorts RELATIVE_TO_EVENT steps by ascending `sendAt` before the loop. Inngest step keys (`step-${sortOrder}-${stepType}`) are immutable per step, so reordering iteration doesn't drift idempotency keys.
- **BUG-MAY6-2** (Notion: [3598c45d…8165](https://www.notion.so/3598c45dd82981658cddc67c70c1aee3)) — "Post-Event Coach Survey Sequence" did not auto-attach on approval. Root cause: `auto-build-service.ts:assignWorkflow` had three issues. (1) Asymmetric WHERE — `workshopFormat` was `OR null` wildcard, but `categoryId` was hard equality when workshop had a category, so the seeded wildcard-category workflow never matched a categoried workshop. (2) `orderBy: { workshopFormat: "desc" }` actually puts NULL **first** under Postgres default null-ordering, so wildcard beat specific (Codex catch). (3) No `isTemplate: true` filter — admin-cloned customizations could shadow templates. Replaced inline `findFirst` with new `lib/workflows/find-auto-attach-workflow.ts` pure ranker: filter eligible candidates in code (category-compatible + format-compatible), then rank by specificity (categoryId 2pts + workshopFormat 1pt, tiebreak `updatedAt`). DB query is now `findMany` filtered to `isActive: true` AND `isTemplate: true` AND matching `workflowPhase`. Verified prod DB has the workflow with correct shape (was always there; matcher just couldn't see it).
- **BUG-MAY6-3** (Notion: [3598c45d…81ab](https://www.notion.so/3598c45dd82981abbce9c584b79ecae7)) — `calculateSendDate` declared a `timezone` param but never used it. `sendTimeOfDay: "09:00"` called `setHours(9, 0, 0, 0)` which on Vercel's UTC server set UTC 09:00, not workshop-local 09:00. Post-Event Step 1 ("1 day after at 9 AM") would fire at 4–5 AM Eastern. New `setWallClockInTimezone(date, timezone, hours, minutes)` exported helper in `lib/workflows/resolve-event-start-moment.ts` reuses the existing `Intl.DateTimeFormat` offset pattern. `calculateSendDate` now uses it when `timezone` is provided; falls back to `setUTCHours` when no timezone (production code always passes a timezone). The `offsetHours` path is unchanged.
- 964 tests passing (up from 951) — 3 new RED→GREEN test files: `order-steps-for-execution.test.ts` (5 tests), `find-auto-attach-workflow.test.ts` (8 tests), `calculate-send-date-timezone.test.ts` (5 tests). Updated `auto-build-service.test.ts` (mock `findMany` instead of `findFirst`) and `workflow-service.test.ts` (3 assertions switched from `setHours` → `setUTCHours` for the no-timezone branch — they were latently TZ-dependent and only passed on UTC servers; production unchanged).
- Tech debt note (Codex): the right long-term shape is per-step Inngest fan-out (one event per step → independent function with `sleepUntil`), creating SCHEDULED rows up-front and isolating 1-day/30-day post-event sleeps. Filed as follow-on: hotfix scope only.
- Plan: `~/.claude/plans/workflow-bugs-elegant-curry.md`. Sprint ledger: `plans/JEFF_MAY6_SPRINT.md`.

### 2026-05-05 — Jeff May 4 Meeting Bugs — Complete (May 5 2026, merged in two PRs #12 + #13): <!-- ENTRY_ISO:2026-05-05 ENTRY_SLUG:jeff-may4-meeting-bugs -->

**Jeff May 4 Meeting Bugs** — Complete (May 5 2026, merged in two PRs #12 + #13):
- BUG-MAY4-1a (timing): `Workshop.eventDate` stored as midnight UTC; `eventTime` ("16:00 - 18:00") and `timezone` ("America/New_York") were never combined when computing `scheduledFor`. New `lib/workflows/resolve-event-start-moment.ts` helper converts wall-clock + IANA zone → true UTC start moment via `Intl.DateTimeFormat` offset math (no new deps, handles DST). `execute-workflow.ts` now feeds `resolveEventStartMoment(workshop)` into `calculateSendDate` instead of raw `new Date(workshop.eventDate)`. Fixes the 20-hour skew that made all steps fire immediately at workflow assignment.
- BUG-MAY4-1b (false-SENT): `EMAIL_ATTENDEES` always wrote `status="SENT"` even with 0 registrants. Fixed to `sentEmails.size > 0 ? "SENT" : "SKIPPED"` with `error: "No recipients at scheduled time"`. `SEND_SURVEY_LINK` already used `sentCount`-based status; `SEND_FILE_LINK` already had an early-exit guard.
- BUG-MAY4-2 (duplicate email): `runAutoBuild` called concurrently from GET email-link + POST dashboard approval handlers, both calling `sendWorkshopBuiltEmail`. Fixed with atomic `db.workshop.updateMany({ where: { workshopBuiltEmailSentAt: null } })` claim — only the first concurrent caller wins. New `Workshop.workshopBuiltEmailSentAt DateTime?` column (migration `20260505100000_add_workshop_built_email_sent_at`). Also added `id: "workshop-approved-${workshopId}-${approvalId}"` to all 3 `inngest.send("workshop/approved")` calls for Inngest-level dedup keyed to approvalId.
- BUG-MAY4-3 (misleading badges): Per-step SENT/SKIPPED/FAILED badges removed from workshop detail Workflow Status card and workflow editor Execution Status tab. A step fires per-recipient — a single badge across N attendees is meaningless.
- **Follow-on PR #15 (May 6 2026, commit `07c58a8`):** three residual fixes surfaced during May 5 production manual test:
  - SEND_SURVEY_LINK 0-recipients message: `execute-workflow.ts` now early-exits before the survey loop and writes `error: "No recipients at scheduled time"` (was misleading `"No survey link could be generated"`). Existing `sentCount === 0` fallback preserved for genuine link-gen failures (regression-guarded).
  - SEND_FILE_LINK false-SENT: `execute-workflow.ts` SEND_FILE_LINK handler now tracks `fileEmailsSent` and writes `status: "SENT"` only if at least one email went out. With files attached AND 0 registrants the row was previously written as SENT — same shape as the EMAIL_ATTENDEES bug fixed in BUG-MAY4-1b.
  - Trigger Now midnight-UTC body context: `trigger-workflow-step.ts:109` now feeds `resolveEventStartMoment({ eventDate, eventTime, timezone })` into the email body interpolation context. Was using raw `new Date(workshop.eventDate)` (midnight UTC) so `{{workshopDate}}` / `{{workshopTime}}` substitutions landed on the wrong day for workshops where the local-zone moment differs from midnight UTC. Same swap `execute-workflow.ts` got in BUG-MAY4-1a.
- 936 tests passing (up from 933) — 3 new RED→GREEN guards (SEND_SURVEY_LINK error msg, SEND_FILE_LINK files-with-0-recipients, trigger-workflow-step `workshopDate` uses `resolveEventStartMoment`)
- **Direct-push gap fix (May 6 2026, commit `47f7073`):** during PR #15 production verification, found that `trigger-workflow-step.ts` (the manual Trigger Now path) had IDENTICAL twin bugs PR #15 didn't touch — its SEND_SURVEY_LINK handler at line 425 wrote `"No survey link could be generated"` for 0 recipients, and its SEND_FILE_LINK handler at line 582 wrote unconditional `status: "SENT"`. Both fixed with the same shape PR #15 used: early-exit before survey loop with `errorMessage: "No recipients at scheduled time"`, and `fileEmailsSent` counter for file-link terminal status. Direct push to main per Alpha-mode deploy rule. 939 tests passing (up from 936).

### 2026-05-06 — Vimeo Embed Bug — Complete (May 6 2026, commit `22ec4f7`, direct push to main): <!-- ENTRY_ISO:2026-05-06 ENTRY_SLUG:vimeo-embed-bug -->

**Vimeo Embed Bug** — Complete (May 6 2026, commit `22ec4f7`, direct push to main):
- Source: Jeff email May 5 5:53 PM — pasting bare Vimeo URLs (no embed HTML) failed to render. Confirmed via production trace + read of `normalizeVideoUrl()` in `lib/templates/landing-page-overlay.ts`.
- Two root causes:
  1. **Regex undercount.** Old regex `/(?:vimeo\.com\/)(\d+(?:\/[a-f0-9]+)?)/` ignored Vimeo's `?h=HASH` query-string share URLs (the modern share form for unlisted videos) — the hash was silently dropped, so unlisted videos served a privacy-blocked player. Path-form `/HASH` was preserved verbatim, but `player.vimeo.com/video/ID/HASH` 410s on the player domain — Vimeo's canonical embed URL is query-form `?h=HASH`. Fix: regex now captures both path-form `/HASH` and query-form `?h=HASH` and emits canonical query form for both.
  2. **Editor preview / template-content-editor / thank-you preview** rendered raw `formData.videoUrl` straight into the iframe `src` — `normalizeVideoUrl` was only called on the public `/workshop/[slug]` route. Fix: moved the normalize call inside `solo-landing-page-template.tsx` and `thank-you-page-template.tsx` so all 4 broken render paths benefit at once (idempotent for already-canonical URLs).
- Production verification on the live editor preview: all 4 supported input forms produce canonical iframe src (`vimeo.com/ID` → `player.vimeo.com/video/ID`; `vimeo.com/ID/HASH` → `player.vimeo.com/video/ID?h=HASH`; `vimeo.com/ID?h=HASH` → unchanged player form; `player.vimeo.com/video/ID?h=HASH` → idempotent). Vimeo's player domain returns 200 on the canonical URL.
- 946 tests passing (up from 939) — 7 new RED→GREEN guards: 3 normalizeVideoUrl unit tests + 4 template component tests asserting iframe src is normalized.
- CSP `frame-src` is currently Stripe-only and report-only (not enforced) — not the root cause here, but tightening it (allowlist `player.vimeo.com` + `youtube.com`) is queued as a defense-in-depth follow-on if/when CSP gets enforced.

### 2026-05-04 — Jeff Apr 30 Sprint — Complete (May 4 2026, all 12 items on main): <!-- ENTRY_ISO:2026-05-04 ENTRY_SLUG:jeff-apr30-sprint -->

**Jeff Apr 30 Sprint** — Complete (May 4 2026, all 12 items on main):
- BUG-01 (commit b139380): password-reset welcome email link no longer 404s — dropped `/auth/` prefix from `api/coaches/route.ts:142` + `api/coaches/[id]/send-password-reset/route.ts:34`
- CHG-02 (commit e00139e): `CERTIFICATION_CONFIDENCE_THRESHOLD` raised 85→101 — every workshop now hits Suzanne. Dead branch preserved as re-enable point
- BUG-03 + BUG-04 + BUG-10 (commit f5bb323): coach detail "Open ↗" button alongside copy-URL; "View Registrations" gated to PRE_EVENT/POST_EVENT/COMPLETED only; workflow editor help tooltip lists `{{surveyUrl}}` + `{{fileLinks}}`
- BUG-02 + ENH-01 + ENH-02 (commit 603b6f9): coach My Workshops "Pricing" column split into Workshop Type + Cost (with isFree-aware render rules); admin Create Workshop wizard label "Workshop Price *" → "Workshop Type *"
- BUG-05 (commit 2f2fc0f): date-format sweep on "Oct 1, 2026" (`dateStyle: "medium"`) + utility renames `formatDate→formatTimestamp`, `formatEventDate→formatEventDateUTC`, `formatDateTime→formatTimestampDateTime`. Five sites switched from zoned → UTC for event dates (workshops list, registration success, financials, admin coach detail, notifications)
- BUG-05-followup (commit 80e7df6): caught during May 4 prod verification — coach workshop detail still rendered `8/12/2026` from inline `.toLocaleDateString()` shims that pre-dated the sprint and weren't part of the original sweep's named-utility scope. Fixed 17 sites across 12 files (coach workshop detail + admin approvals/workflows + invite section + file manager + approval thread + workshop list filters + workflow editor + activate-template modal + Step2Logistics + approvals route email body). New regression guard at `src/__tests__/lint/no-inline-tolocaledatestring.test.ts` flags zero-arg / timezone-only / numeric-month patterns; CI will fail any future reintroduction
- BUG-02-admin-followup (commit 3bc65fb): caught during May 4 transcript-grounded re-verification — admin `/workshops` list still showed only `Cost + Format` columns; the half-day/full-day pricing-tier label only appeared as a subtitle under the workshop title. Original BUG-02 (commit 603b6f9) fixed the coach side but missed the admin dashboard, which was Jeff's literal Apr 30 ask (transcript 1:13–2:11). Added `pricingTier: true` to the admin Prisma include, inserted a new `Workshop Type` header + cell rendering `pricingTier?.name` with em-dash fallback. Regression guard at `src/__tests__/admin/workshops-list-columns.test.ts` asserts both `Cost` + `Workshop Type` headers + the `pricingTier: true` include remain in source
- CHG-01 (commit 0c8ae69): edit-and-resubmit flow removed entirely — `api/workshops/[id]/resubmit/route.ts` deleted; `resubmit-workshop.tsx` pruned to info_requested-only; DENIED + CANCELED workshops show "Submit a new request" CTA → `/portal/request`. INFO_RESPONSE post body fixed to include `action: "INFO_RESPONSE"` (was silently rejected by route handler)
- BUG-09 (commit db9245d): WorkflowStepExecution `scheduledFor` now preserved end-to-end. New helpers `scheduleWorkflowExecution()` + `recordWorkflowExecution()`. RELATIVE_TO_EVENT future sends now create a SCHEDULED row pre-sleep so the portal Workflow Status card shows the planned fire time. Cancel cleanup broadened from `status: "PENDING"` to `status: { in: ["PENDING", "SCHEDULED"] }`
- BUG-06–08 (commit 6941e64): every approval mutation now appends a thread message — initial coach REQUEST (Prisma nested write), admin INFO_REQUEST/COUNTER_OFFER/APPROVED/DENIED (POST + email-link GET), coach INFO_RESPONSE/COUNTER_ACCEPT/COUNTER_DECLINE/COUNTER_COUNTER (with COUNTER_COUNTER newly wrapped in `$transaction`). Helper at `lib/approvals/approval-thread.ts`. New `ApprovalMessage.synthetic` column with index for clean backfill rollback. One-time backfill at `scripts/backfill-approval-messages.ts` with mandatory `--dry-run` + dup-check on `synthetic = true` AND text shape
- CHG-03 (commit ef9fb39): iDev affiliate pixel now driven by admin-pasted `LandingPage.customCode` instead of `IDEV_SCRIPT_URL` env var. New `LandingPage.customCode` column + `Registration.@@index([stripeSessionId])`. parse5-based `validateCustomCode()` (img-only, https-only, host pinned to scalingup.idevaffiliate.com, no scripts/event handlers/style/data:/javascript:) at both save-time AND render-time. `interpolateCustomCode()` substitutes `{{saleAmount}}`, `{{orderNumber}}`, `{{email}}`, `{{currency}}` URL-encoded then HTML-escaped. Shared `<CustomCodeRenderer>` mounted at both `/workshop/[slug]?session_id=` (THANK_YOU LandingPage path) and `/registration/success` (fallback). `IdevTracking` component + `IDEV_SCRIPT_URL` env var deleted. customCode never accepted from request bodies on coach-accessible routes
- 914 tests passing (up from 861) — adds the `no-inline-tolocaledatestring` regression guard from BUG-05-followup + the `workshops-list-columns` guard from BUG-02-admin-followup

### 2026-04-29 — Jeff Apr 28 Sprint — Complete (commit 229faee on main, Apr 29 2026): <!-- ENTRY_ISO:2026-04-29 ENTRY_SLUG:jeff-apr28-sprint -->

**Jeff Apr 28 Sprint** — Complete (commit 229faee on main, Apr 29 2026):
- `formatStepLabel()` helper strips `{{tokens}}`, falls back to STEP_TYPE_LABELS
- Workflow Status card: step names now visible (flex min-w-0 layout fix)
- Trigger Now: auto-refreshes page after fire; SENT steps re-triggerable via `forceResend=true` flag
- `SEND_SURVEY_LINK` step now fires: passes `surveyTemplateId` to `getOrCreateSurveyLink`; PRE_WORKSHOP template seeded to prod
- CSV export `GET /api/registrations/export` (RFC 4180, injection-safe, confirmed-only)
- Contacts page: h1 → "Contacts", Export All button
- 861 tests passing (up from 847)

### 2026-02-15 — Sprint 0 (Schema Foundation) — Complete <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-0-schema-foundation -->

**Sprint 0** (Schema Foundation) — Complete
### 2026-02-15 — Sprint 1 (Security + Auth + Critical Bug Fixes) — Complete <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-1-security-auth -->

**Sprint 1** (Security + Auth + Critical Bug Fixes) — Complete
### 2026-02-15 — Sprint 2 (Workshop Wizard & UI) — Complete (15/15 tasks) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-2-wizard-ui -->

**Sprint 2** (Workshop Wizard & UI) — Complete (15/15 tasks)
### 2026-02-15 — Sprint 3 (Dashboards + Notifications + Polish) — Complete (11/11 tasks) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-3-dashboards -->

**Sprint 3** (Dashboards + Notifications + Polish) — Complete (11/11 tasks)
### 2026-02-15 — Sprint 4 Track D (ICS Calendar Files) — Complete (3/3 tasks) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-4-d-ics -->

**Sprint 4 Track D** (ICS Calendar Files) — Complete (3/3 tasks)
### 2026-02-15 — Sprint 4 Track A (Workflow Editor) — Complete (6/6 tasks) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-4-a-workflow-editor -->

**Sprint 4 Track A** (Workflow Editor) — Complete (6/6 tasks)
### 2026-02-15 — Sprint 4 Track C (Survey System) — Complete (6/6 tasks) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-4-c-surveys -->

**Sprint 4 Track C** (Survey System) — Complete (6/6 tasks)
### 2026-02-15 — Sprint 4 Track B (File Attachments) — Complete (4/4 tasks) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:sprint-4-b-files -->

**Sprint 4 Track B** (File Attachments) — Complete (4/4 tasks)
### 2026-02-15 — QA Sprint (Visual QA & Blocker Fixes) — Complete (6/6: mobile nav, follow-up form, settings save, search cleanup, error boundaries, quick actions) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:qa-sprint-visual -->

**QA Sprint** (Visual QA & Blocker Fixes) — Complete (6/6: mobile nav, follow-up form, settings save, search cleanup, error boundaries, quick actions)
### 2026-02-15 — JV Gap Fixes (Admin Create Workshop Form) — Complete (3/3: dynamic categories, pricing tier dropdown, terms checkbox) <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:jv-gap-fixes -->

**JV Gap Fixes** (Admin Create Workshop Form) — Complete (3/3: dynamic categories, pricing tier dropdown, terms checkbox)
### 2026-02-20 — Production Readiness — Complete (7/7 gaps fixed): <!-- ENTRY_ISO:2026-02-20 ENTRY_SLUG:production-readiness -->

**Production Readiness** — Complete (7/7 gaps fixed):
- Category + PricingTier seed data added to `prisma/seed.ts`
- Approvals route now wires `categoryId`/`pricingTierId` into Workshop create
- Survey submission rate limiting (20 req/min via Redis)
- File upload filename sanitization (path traversal prevention)
- File DELETE ownership check (only uploader or admin/staff can delete)
- INNGEST env vars added to `.env.example`
### 2026-02-20 — UI/UX Overhaul Phase 1 — Complete (via UI/UX Pro Max Skill): <!-- ENTRY_ISO:2026-02-20 ENTRY_SLUG:ui-ux-overhaul-phase-1 -->

**UI/UX Overhaul Phase 1** — Complete (via UI/UX Pro Max Skill):
- Design system generated: Trust & Authority style, data-dense dashboard palette
- Font: Plus Jakarta Sans (replaced Geist Sans) — professional, SaaS-friendly
- Primary color deepened to #1D4ED8 (Blue 700) for trust/authority
- Extended CSS tokens: success/warning/info semantics, shadow depth scale, animation tokens
- `prefers-reduced-motion` support added globally
- 7 upgraded components: Button (success/warning variants, hover lift, active press), Card (hover shadow), Input (focus animation), Badge (rounded-full, semantic colors), Table (header bg, uppercase tracking), StatusPill (pulse on active), ConfirmationModal (polish)
- 9 new components: Skeleton, Tooltip, Popover, Progress, Avatar, Separator, Alert (5 variants), EmptyState, PageHeader
- 4 Radix dependencies added: tooltip, popover, progress, separator
- Framer Motion installed + `src/lib/animations.ts` with reusable variants
- Admin layout: sticky nav with backdrop blur, avatar, semantic tokens
- Coach layout: polished sidebar with primary-colored avatar
- Design system persisted: `design-system/scaling-up-platform/MASTER.md` + page overrides
- DB tables confirmed in sync via `prisma db push` (no migration needed)

### 2026-02-25 — UI/UX Phase 2+ (Animations + Dark Mode) — Complete: <!-- ENTRY_ISO:2026-02-25 ENTRY_SLUG:ui-ux-phase-2-dark-mode -->

**UI/UX Phase 2+ (Animations + Dark Mode)** — Complete:
- Framer Motion animations added to 15+ pages (FadeUp, StaggerContainer, StaggerItem wrappers)
- Dark mode: next-themes integration, ThemeProvider, ThemeToggle in all 3 layouts
- `.dark` CSS variable overrides in globals.css

### 2026-02-25 — Dark Mode Color Migration — Complete: <!-- ENTRY_ISO:2026-02-25 ENTRY_SLUG:dark-mode-color-migration -->

**Dark Mode Color Migration** — Complete:
- 1,000+ hardcoded gray Tailwind classes replaced across 80 files
- Replacements: text-gray-* → text-foreground/text-muted-foreground, bg-white → bg-card, bg-gray-50 → bg-muted, border-gray-* → border-border, divide-gray-* → divide-border, hover:bg-gray-* → hover:bg-accent
- Admin approvals page rewritten from inline JSX styles to Tailwind classes
- Semantic status colors (green, red, yellow, orange, blue) intentionally preserved
- Commit: `edfc722`

### 2026-02-25 — Phase F: Defensive Code Fixes — Complete (3/3): <!-- ENTRY_ISO:2026-02-25 ENTRY_SLUG:phase-f-defensive -->

**Phase F: Defensive Code Fixes** — Complete (3/3):
- HubSpot: Lazy client init via Proxy, `isHubSpotConfigured()` guard on all 8 exported functions — returns no-op when `HUBSPOT_ACCESS_TOKEN` missing
- Circle.so: `getCircleProfileByEmail()` returns `null` when `CIRCLE_API_KEY` missing (verifyCertification already handled)
- Inngest: Startup warnings when `INNGEST_EVENT_KEY` or `INNGEST_SIGNING_KEY` missing

### 2026-02-20 — CIO Revision Audit Pass (Feb 20, 2026) — Complete (P0 updates): <!-- ENTRY_ISO:2026-02-20 ENTRY_SLUG:cio-audit-feb20 -->

**CIO Revision Audit Pass (Feb 20, 2026)** — Complete (P0 updates):
- Navigation clarity: `All Workshops` naming restored in admin IA
- Added direct `Bio` nav route and `Financials` nav route in admin header
- Workshop Editor scope tightened to workshop pages (removed BIO page from template picker)
- Admin Create Workshop: removed visible Workshop Type field (category-first flow)
- Paid workshops now require approved pricing tier selection (manual fallback removed)
- Free registration path now syncs to HubSpot (paid sync already handled by Stripe webhook)

### 2026-02-26 — Context Bloat Cleanup (Feb 26, 2026) — Complete: <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:context-bloat-cleanup -->

**Context Bloat Cleanup (Feb 26, 2026)** — Complete:
- Deleted 6 dead code files (~800 lines): animations.ts, cache.ts, api-handler.ts, logger.ts, landing-page-auto-populate.ts, workshop-generator.ts
- Fixed toast dismiss bug in `use-toast.ts` L109 (`onsubmit` → `toastId`)
- Removed unused `bullmq` dependency (12 sub-packages)
- Consolidated 3 duplicate SMTP transports into shared `lib/smtp-transport.ts`
- Merged dual admin layouts: moved 6 pages from standalone `/admin/` into `(dashboard)/admin/`
- npm audit fix: 1 fixed, 3 low-severity cookie vulns deferred (next-auth breaking change)
- All verified: 0 type errors, 226/226 tests pass, build succeeds

### 2026-02-27 — Security Hardening S1-S8 (Feb 27, 2026) — Complete (commit `3a685ca`): <!-- ENTRY_ISO:2026-02-27 ENTRY_SLUG:security-hardening-s1-s8 -->

**Security Hardening S1-S8 (Feb 27, 2026)** — Complete (commit `3a685ca`):
- S1: Nonce added to password reset tokens (`lib/auth/password-reset.ts`)
- S2: Webhook secret enforcement in production (Typeform + Stripe)
- S3: Question-to-survey template validation (`lib/surveys/survey-service.ts`)
- S4: JSON.parse try-catch in forgot-password route
- S5: Error handlers on 3 API routes (workflow assign, survey submit, survey endpoint)
- S6: 15-second AbortController timeouts on external APIs (Stripe, Circle, HubSpot)
- S7: Auto-build idempotency guard (prevents duplicate builds on Inngest retry)
- S8: Email attendee deduplication via Set in workflow execution
- S9 (Mar 2): Auto-build idempotency guard returns structured `{ skip, pageCount, status }` (replaces bare boolean for debuggability)

### 2026-02-27 — Test Coverage Push T1-T10 (Feb 27, 2026) — Complete: <!-- ENTRY_ISO:2026-02-27 ENTRY_SLUG:test-coverage-t1-t10 -->

**Test Coverage Push T1-T10 (Feb 27, 2026)** — Complete:
- 37 test suites / 415 tests total (up from 28/269)
- 9 new test files: auto-build, execute-workflow, workshop-status, surveys, auth, files, workshop-resubmit, completion-summary, typeform-webhook
- All critical paths now covered: Inngest functions, auth routes, status transitions, file upload, webhooks
- 8 Playwright E2E spec files covering 40+ automatable checks across 12 rounds
- 12 remaining manual checks require email inbox / external service access (see `plans/MANUAL_VERIFICATION_REMAINING_CHECKS.md`)
- Production launch guide: `plans/PRODUCTION_LAUNCH_GUIDE.md`

### 2026-03-02 — Phase 4 Smoke Test (Mar 2, 2026) — Complete (12/12 checks passed): <!-- ENTRY_ISO:2026-03-02 ENTRY_SLUG:phase-4-smoke-test -->

**Phase 4 Smoke Test (Mar 2, 2026)** — Complete (12/12 checks passed):
- Tests #1-6: Image upload, emails (requested/approved/denied), auto-status, landing pages
- Test #7: Auto-build pipeline verified end-to-end (7 Inngest steps, status → PRE_EVENT)
- Test #8: Workflows — code correct, no workflows configured yet (content dependency)
- Tests #9-10: No broken placeholders, registration flow works
- Test #11: Stripe payment (verified in Phase 3)
- Test #12: Inngest running (5 functions registered)
- Fix 8 deployed: Structured idempotency logging in auto-build (`{ skip, pageCount, status }` instead of bare boolean)
- Content gaps identified: No active landing page templates, no workflows configured (data setup, not code bugs)
- Production launch assessment: `plans/PRODUCTION_LAUNCH_GUIDE.md` (Steps 1-3, 5, 8 still pending)

### 2026-03-03 — Production Configuration (Mar 3, 2026) — Complete (Steps 1-10): <!-- ENTRY_ISO:2026-03-03 ENTRY_SLUG:production-configuration -->

**Production Configuration (Mar 3, 2026)** — Complete (Steps 1-10):
- 35 env vars pushed to Vercel via `scripts/push-env-to-vercel.mjs` (with production overrides for NEXTAUTH_URL, APP_URL, LANDING_PAGE_BASE_URL, DEMO_MODE)
- Stripe webhook configured (3 events: checkout.session.completed, payment_intent.succeeded, payment_intent.payment_failed)
- Inngest verified: 5 functions active (auto-build-workshop, check-stale-approvals, execute-workflow, schedule-email-sequence, workshop-completion-summary)
- "Standard Pre-Event Sequence" workflow created (Phase=Pre-Event, 1 email step: 1 day before event)
- Snake_case variable aliases added to `interpolateTemplate()` — both `{{workshop_title}}` and `{{workshopTitle}}` now work
- `workshopFormat` variable added to workflow context
- Production smoke test passed (5/5 tests): workshop create, approve, auto-build, Inngest runs, landing page render
- Vercel Analytics + Speed Insights installed (`@vercel/analytics`, `@vercel/speed-insights` in root layout)
- Go-live checklist: `plans/GO_LIVE_CHECKLIST.md`
- Handoff document: `plans/PRODUCTION_HANDOFF_MARCH_2026.md`
- Commits: `c0c002d` (variable aliases), pending commit (analytics + handoff docs)

### 2026-03-10 — Admin Capabilities (Mar 6-10, 2026) — Complete: <!-- ENTRY_ISO:2026-03-10 ENTRY_SLUG:admin-capabilities -->

**Admin Capabilities (Mar 6-10, 2026)** — Complete:
- Workshop permanent delete: `POST /api/workshops/[id]/delete` (ADMIN-only, CANCELED/COMPLETED only, title confirmation)
- Coach delete fix: CASCADE on Workshop/ApprovalQueue/FollowUpReport FKs, transaction deletes Coach + User, cascade counts in audit log
- Admin invite system: `AdminInvite` model, crypto token (7-day TTL), accept-invite page, bcrypt(12) passwords
- Auth modification: `src/lib/auth/auth.ts` — non-canonical ADMIN emails checked against AdminInvite (must have acceptedAt set)
- New files: `delete-workshop-dialog.tsx`, `delete-coach-button.tsx`, `invite-admin-section.tsx`, `accept-invite/page.tsx`
- New API routes: `/api/workshops/[id]/delete`, `/api/admin/invite`, `/api/admin/invite/[id]`, `/api/auth/accept-invite`

### 2026-03-10 — Verification Hardening (Mar 10, 2026) — Complete: <!-- ENTRY_ISO:2026-03-10 ENTRY_SLUG:verification-hardening -->

**Verification Hardening (Mar 10, 2026)** — Complete:
- MR-28: Auto-build logs warning + returns `noTemplatesAvailable` flag when no active templates exist
- MR-37: Workflow tooltip replaced with Radix `<Tooltip>` (accessible, keyboard-navigable, aria-label)
- Coach delete: audit trail counts inside transaction, `hasActiveWorkshops` uses dedicated count query (not limited by `take: 10`)
- Coach delete UI: uses `useToast` instead of `alert()`, confirmation mentions approvals + follow-up reports
- Security: `isCanonicalAdminEmail` now fails closed (returns false when `ADMIN_EMAIL` unset)
- Security: accept-invite token comparison uses `crypto.timingSafeEqual` (timing-safe)
- Security: admin invite API routes properly return 401 for unauthenticated (not 403)
- Invite UI: loading state prevents false "No invitations yet" flash during initial fetch
- March audit state: 36 PASS, 10 CONCERN (5 resolved by design, 2 fixed, 1 need manual proof, 2 flagged for Jeff), 0 GAP

### 2026-03-18 — Figma Revisions Batch (Mar 17–18, 2026) — ALL 11 REVISIONS COMPLETE (52 suites / 488 tests): <!-- ENTRY_ISO:2026-03-18 ENTRY_SLUG:figma-revisions-batch -->

**Figma Revisions Batch (Mar 17–18, 2026)** — **ALL 11 REVISIONS COMPLETE** (52 suites / 488 tests):
- Sprint 1 (P0 bugs): FIG-001 auto-title category reactive useEffect; FIG-010 isFree = priceCents===0 fix; FIG-003 dropdown bg-background fix
- Sprint 2 (edit access): FIG-004 View Public Page conditional button (PRE_EVENT+); FIG-006 WorkshopInlineEditForm full field set incl. category/format
- Sprint 3 (pricing flow): FIG-007 CUSTOM_PRICING approval flow (coach submits → admin approves → Workshop.priceCents updated, no auto-build); FIG-008 customPricingNotes in emails; FIG-009 ResubmitWorkshop `variant="info_requested"` — full edit + pricing read-only
- Sprint 4 (validation + templates): FIG-011 virtualLink required server+client; FIG-005 LandingPage.categoryId + per-category template matching in auto-build
- PRE-3: Deleted `coach-respond/route.ts` duplicate; canonical is `coach-response/route.ts` (added rate limiting)
- Key new capability: PATCH `/api/workshops/[id]` expanded for COACH role with `COACH_EDITABLE_FIELDS` allowlist; pricing fields create CUSTOM_PRICING approval instead of direct update
- Key new email: `sendCustomPriceChangeEmail()` — old/new price comparison + custom notes
- Lead-time bypass: `isCoach && existing.status === "INFO_REQUESTED"` skips 14-day date validation
- E&V templates seeded via `prisma/seed-ev-templates.ts` (inactive — admin must activate at `/templates`)
- Branch: `figma-revisions-mar2026` — PR open at github.com/jcbdelo26/Scaling-up-platform-v2/compare/figma-revisions-mar2026
- Parsed revisions: `plans/FIGMA_REVISIONS_PARSED.md` | Sprint plan: `plans/FIGMA_REVISIONS_SPRINT_PLAN_MAR2026.md`

### 2026-03-18 — New API Routes (Figma Batch): <!-- ENTRY_ISO:2026-03-18 ENTRY_SLUG:figma-batch-api-routes -->

**New API Routes (Figma Batch):**
- `PATCH /api/workshops/[id]` — Expanded: COACH role now allowed with `COACH_EDITABLE_FIELDS` allowlist; pricing fields intercepted → CUSTOM_PRICING approval
- `POST /api/approvals/[id]/coach-response` — Coach respond to INFO_REQUESTED (canonical; `coach-respond` deleted)
- CUSTOM_PRICING approval type fully handled in `approvals/[id]/respond/route.ts` — updates priceCents/isFree/pricingTierId, returns early (no auto-build)

### 2026-03-18 — Schema Changes (Figma Batch): <!-- ENTRY_ISO:2026-03-18 ENTRY_SLUG:figma-batch-schema -->

**Schema Changes (Figma Batch):**
- `LandingPage.categoryId` (String?, FK→Category) — per-category template matching in auto-build
- Migration: `add_landing_page_category`

### 2026-03-11 — MR-21 Coupon/Checkout Fix (Mar 11, 2026) — Complete (commits `0556da5`, `5abcda2`): <!-- ENTRY_ISO:2026-03-11 ENTRY_SLUG:mr-21-coupon-checkout -->

**MR-21 Coupon/Checkout Fix (Mar 11, 2026)** — Complete (commits `0556da5`, `5abcda2`):
- Stripe `allow_promotion_codes` and `discounts` are mutually exclusive — conditional spread in `services/stripe.ts:148`
- `/api/checkout` added to middleware public routes (both `authorized` callback and middleware function)
- `registration-form.tsx` — defensive content-type check before `.json()` parsing, Zod error array formatting
- TDD tests added: `stripe.test.ts` (allow_promotion_codes exclusion), `checkout.test.ts` (discount forwarding + StripeDiscountCodeError), `template-interpolation.test.ts` (10 tests)
- Test totals: 51 suites / 488 tests (up from 50/473); Figma batch brought to 52 suites / 488 tests

### 2026-03-11 — MR-30 Paid Attendee Removal Verified (Mar 11, 2026): <!-- ENTRY_ISO:2026-03-11 ENTRY_SLUG:mr-30-paid-attendee-removal -->

**MR-30 Paid Attendee Removal Verified (Mar 11, 2026):**
- Coach unregister on paid attendee → routes to approval queue (not direct delete)
- Admin email: "[ACTION REQUIRED] Cancellation Request" with "REFUND REQUIRED", attendee name, $199.50
- CANCELLATION approval in admin queue with Approve/Deny
- Refund is manual via Stripe dashboard — by design
- Verified via fake paid registration seeded in Neon SQL (no real payment)
- Known gap: approval respond route treats CANCELLATION same as WORKSHOP_REQUEST (advances status to PRE_EVENT, sends workshop-approved email) — needs CANCELLATION-specific branch

### 2026-02-27 — Design Token Consolidation + Color Sweep (Feb 27, 2026) — Complete: <!-- ENTRY_ISO:2026-02-27 ENTRY_SLUG:design-token-consolidation -->

**Design Token Consolidation + Color Sweep (Feb 27, 2026)** — Complete:
- Single source of truth: `globals.css` (`brand-tokens.css` deleted — had zero imports)
- Added `--status-*` tokens (requested/awaiting/active/post/completed/canceled) with light+dark
- Added `--sidebar-*` tokens (sidebar/foreground/muted/border) for coach portal
- Swept ~1,087 hardcoded Tailwind colors → semantic tokens across ~80 files
- Foundation components fixed: utils, status-pill, badge, alert, confirmation-modal, checkbox
- Workflow/survey components fixed: timeline, editor, executions, template-editor, template-toggle
- Coach sidebar fixed: portal layout + mobile nav use `--sidebar-*` tokens
- Bulk page sweep: dashboard, portal, public, components all tokenized
- `MASTER.md` updated to match actual implementation

### 2026-02-26 — Feb 25 Call Revisions (Feb 26-27, 2026) — ALL 7 SPRINTS COMPLETE (65/65 tasks): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-call-revisions -->

**Feb 25 Call Revisions (Feb 26-27, 2026)** — **ALL 7 SPRINTS COMPLETE** (65/65 tasks):
- Source: 64-min walkthrough by Jeff Verdun + Suzanne Krygier (Feb 24, 2026)
- 42 revisions + 5 gap fixes identified, organized into 7 sprints
- 24 video frames extracted and analyzed for visual context
- Sprint 1 complete: Form cleanup (HYBRID, virtualPlatform, early bird removed; free-form pricing, venue instructions, T&C link)
- Sprint 2 complete: Schema migration (Category defaults, Workshop geo/excluded, Registration attendance/marketing); auto-title/description; category admin editor
- Sprint 3 complete: Coach portal enhancements (unregister API + UI, attendance tracking, survey results page, workflow status on coach + admin detail, rejection/edit/resubmit flow)
- Sprint 4 complete: Coach profile + notification emails (Circle.so cleanup, image upload, LinkedIn URL, CTA toggle, 3 notification emails wired)
- Sprint 5 complete: Auto-Build on Approval (flagship) — Inngest function, template toggle, workflow auto-assign, variable interpolation, status automation, built email
- Sprint 6 complete: Financials filters (coach/category/date range), workshop completion summary Inngest function, registration form (phone+company required, marketing opt-in)
- Sprint 7 complete: Aggregated survey results page, cross-workshop API mode, coach post-workshop + 30-day follow-up survey seeds, post-event coach survey workflow seed

### 2026-02-26 — New API Routes (Sprints 3-5): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-api-routes -->

**New API Routes (Sprints 3-5):**
- `DELETE /api/registrations/[id]` — Direct unregister (coach-scoped, Stripe refund)
- `PATCH /api/registrations/[id]` — Toggle attendance (attended + attendedAt)
- `POST /api/workshops/[id]/resubmit` — Resubmit denied workshop for approval
- `POST /api/portal/profile/image` — Coach profile image upload (Vercel Blob, 5MB max)
- `PATCH /api/landing-pages/[id]` — Update landing page properties (isActiveTemplate toggle)

### 2026-02-26 — New Pages (Sprint 3): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-new-pages -->

**New Pages (Sprint 3):**
- `/portal/workshops/[id]/surveys` — Coach survey results (grouped by template)

### 2026-02-26 — New Components (Sprints 3 + 5): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-new-components -->

**New Components (Sprints 3 + 5):**
- `components/workshops/resubmit-workshop.tsx` — Rejection reason + edit + resubmit client component
- `components/templates/active-template-toggle.tsx` — Toggle "Set as Active Template" for auto-build

### 2026-02-26 — Schema Changes (Sprint 4): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-schema-sprint-4 -->

**Schema Changes (Sprint 4):**
- `Coach.linkedinUrl` (String?) — LinkedIn profile URL
- `Coach.showBookCallCta` (Boolean, default true) — Toggle CTA on bio page
- Migration: `20260227000000_feb25_coach_profile_fields`

### 2026-02-26 — Schema Changes (Sprint 5): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-schema-sprint-5 -->

**Schema Changes (Sprint 5):**
- `LandingPage.isActiveTemplate` (Boolean, default false) — Marks page as template for auto-build cloning
- `Workflow.categoryId` (String?, FK→Category) — Auto-assign by category
- `Workflow.workshopFormat` (String?) — "IN_PERSON" or "VIRTUAL", null = any
- `Workflow.workflowPhase` (String?) — "PRE_EVENT" or "POST_EVENT"
- Migration: `20260227100000_feb25_sprint5_auto_build_fields`

### 2026-02-26 — Notification Emails (Sprints 4 + 5): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-notification-emails -->

**Notification Emails (Sprints 4 + 5):**
- `sendWorkshopRequestedEmail()` — To coach + admin on workshop submit
- `sendWorkshopApprovedEmail()` — To coach when workshop approved
- `sendWorkshopDeniedEmail()` — To coach when workshop denied (includes reason + resubmit link)
- `sendWorkshopBuiltEmail()` — To coach after auto-build (pages created, workflows assigned)

### 2026-02-26 — Auto-Build on Approval (Sprint 5 - Flagship): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-auto-build -->

**Auto-Build on Approval (Sprint 5 - Flagship):**
- `inngest/functions/auto-build-workshop.ts` — Triggered by `workshop/approved` event
- Copies active landing page templates with variable interpolation (20+ variables)
- Auto-assigns PRE_EVENT + POST_EVENT workflows by category/format match
- Advances workshop status AWAITING_APPROVAL → PRE_EVENT
- Emits `workflow/schedule` events for each assigned workflow
- Sends coach notification with build summary

### 2026-02-26 — Sprint 6 — Dashboard, Financials & Registration: <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-sprint-6 -->

**Sprint 6 — Dashboard, Financials & Registration:**
- `components/financials/financial-filters.tsx` — Client component: coach/category dropdowns, custom date range picker
- `admin/financials/page.tsx` — Updated with coach/category/date filtering on all queries
- `inngest/functions/workshop-completion-summary.ts` — Triggered by `workshop/completed` event, emails admin with attendee list + revenue total
- `services/notifications.ts` — Added `sendWorkshopCompletionSummary()` (attendee table + revenue breakdown)
- `api/workshops/[id]/status/route.ts` — Emits `workshop/completed` Inngest event on COMPLETED transition
- Registration form: phone + company now required, marketing opt-in checkbox added
- `lib/validations.ts` — `createRegistrationSchema` updated: company required, phone required, marketingOptIn field
- `lib/registration-service.ts` — Passes `marketingOptIn` through to `db.registration.create`
- `api/workshops/[id]/register/route.ts` — Updated Zod schema + parseRegistrationInput for new fields
- `inngest/types.ts` — Added `workshop/completed` event type
- `api/inngest/route.ts` — Registered `workshopCompletionSummary` function
### 2026-02-26 — Sprint 7 — Aggregated Surveys & Coach Surveys: <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-sprint-7 -->

**Sprint 7 — Aggregated Surveys & Coach Surveys:**
- `admin/surveys/aggregate/page.tsx` — Cross-workshop aggregated survey results page (template selector tabs, summary cards, per-question distribution bars, per-workshop breakdown table)
- `api/survey-templates/[id]/results/route.ts` — Added `workshopId=all` support (passes undefined for cross-workshop aggregation)
- `admin/surveys/page.tsx` — Added "Aggregated Results" link button
- `prisma/seed.ts` — Added "Coach Post-Workshop Survey" template (5 questions), "Coach 30-Day Follow-Up Survey" template (5 questions), "Post-Event Coach Survey Sequence" workflow (2 steps: 1-day + 30-day)

### 2026-02-26 — Status Automation (Sprint 5): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-status-automation -->

**Status Automation (Sprint 5):**
- Manual "Move to" buttons removed from workshop-actions (kept Cancel + POST_EVENT/COMPLETED)
- "Send Reminder Email" button removed from quick-actions (handled by workflows)

### 2026-02-26 — Circle.so Cleanup (Sprint 4): <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-circle-cleanup -->

**Circle.so Cleanup (Sprint 4):**
- Removed Circle sync button from `coaches/[id]/page.tsx`
- Removed Circle import from `bio/[id]/page.tsx`
- Removed Circle populate from `workshops/[id]/landing-pages/bio-page/page.tsx`
- Removed "imported from Circle.so" text from `coach-profile-form.tsx`

### 2026-02-26 — Feb 25 Roadmap: `D:\The CTO Project\plans\FEB25_CALL_REVISIONS_IMPLEMENTATION_ROADMAP.md` <!-- ENTRY_ISO:2026-02-26 ENTRY_SLUG:feb25-roadmap-pointers -->

**Feb 25 Roadmap:** `D:\The CTO Project\plans\FEB25_CALL_REVISIONS_IMPLEMENTATION_ROADMAP.md`
**Feb 25 Task Tracker:** `D:\The CTO Project\plans\FEB25_IMPLEMENTATION_TASKS.md` (65/65 tasks — ALL SPRINTS COMPLETE)
**Feb 25 Video Frames:** `docs/Context Building Call Transcripts/Feb 25/frames/` (24 frames, 7 sprint folders)

### 2026-02-15 — Previous Plans: <!-- ENTRY_ISO:2026-02-15 ENTRY_SLUG:previous-plans-pointers -->

**Previous Plans:**
- Production Readiness: `plans/PRODUCTION_READINESS_ROADMAP.md` + `plans/PRODUCTION_READINESS_TASKS.md`
- JV Revisions (Feb 15): `plans/JEFF_VERDUN_REVISIONS_IMPLEMENTATION_ROADMAP.md` + `plans/JEFF_VERDUN_REVISION_TASKS.md`
- CIO Audit (Feb 20): `plans/CIO_WORD_FOR_WORD_REVISION_AUDIT_AND_IMPLEMENTATION_PLAN_FEB20_2026.md`
- Figma Revisions (Mar 17): `plans/FIGMA_REVISIONS_SPRINT_PLAN_MAR2026.md` (11 revisions, 4 sprints — COMPLETE)

