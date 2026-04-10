# Design Spec: Jeff's Revisions Iteration

**Date:** 2026-03-26
**Status:** Draft
**Author:** Claude (brainstorming skill)
**Stakeholder:** Jeff Verdun (CIO, Scaling Up)

---

## Overview

Four fixes addressing feedback from Jeff Verdun's platform review. The overarching principle: **once Suzanne approves a workshop, everything builds automatically with zero manual work.** Templates should be independent objects, coaches must complete their bio before requesting workshops, pages should auto-publish on approval, and coaches become read-only after approval.

### Fixes Summary

| Fix | Priority | Complexity | Description |
|-----|----------|------------|-------------|
| #1 | CRITICAL | High | Decouple templates from workshops — new `PageTemplate` model |
| #2 | CRITICAL | Medium | Coach bio validation + auto-publish + post-approval lockdown |
| #3 | Minor | Low | Add price display to coach workshop detail |
| #4 | Verify | Low | Confirm admin edit propagation works; add title/description sync |

---

## Fix #1: Decouple Templates from Workshops

### Problem

Templates are currently `LandingPage` records with `isActiveTemplate=true`, requiring a `workshopId` FK. They live under fake "template host" workshops (WS-TMPL-0001, WS-TMPL-EV01). Deleting a host workshop deletes templates. Templates cannot be managed independently of workshops.

### Design Decision

**Approach A chosen: New `PageTemplate` model** — fully independent table with no `workshopId` FK. Clean separation between "template" (admin-managed source content) and "page" (workshop-specific generated output).

Rejected alternatives:
- **Approach B (nullable workshopId):** Overloads `LandingPage` with two concepts. Queries get confusing.
- **Approach C (JSON blob store):** No visual editor. Admin would edit raw JSON.

### Schema: `PageTemplate` Model

```prisma
model PageTemplate {
  id           String              @id @default(cuid())
  name         String              // e.g., "AI Workshop Solo Landing"
  templateType LandingPageTemplate // BIO_PAGE, SOLO_LANDING, DUO_LANDING, REGISTRATION, THANK_YOU
  categoryId   String?             // null = global template
  content      String              // JSON string with {{variable}} placeholders (TEXT column, not JSONB)
  isActive     Boolean             @default(false)
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt

  category Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)

  @@index([isActive])
  @@index([templateType, categoryId])
  @@map("page_templates")
}
```

**Content column:** Stored as TEXT, not JSONB. Content is treated as an opaque blob — editors read/write it wholesale. No Prisma JSON filtering needed. If querying into content becomes necessary later, that would be a separate migration to JSONB.

**Partial unique index (raw SQL):** Added via migration SQL to enforce one active template per slot at the DB level:
```sql
CREATE UNIQUE INDEX page_templates_active_slot
ON page_templates("templateType", COALESCE("categoryId", '__GLOBAL__'))
WHERE "isActive" = true;
```
The `COALESCE` is necessary because PostgreSQL treats `NULL != NULL` in unique indexes — without it, multiple active global templates (categoryId=NULL) of the same type would bypass the constraint. `'__GLOBAL__'` is a sentinel value that will never collide with a real cuid. This prevents race conditions while allowing multiple inactive templates per slot.

**Category relation:** Add `pageTemplates PageTemplate[]` to the `Category` model.

### Template Slot Rules

- **One active template per slot.** A slot is defined as `(templateType, categoryId)`.
- Activating a template in a slot deactivates the previous active template in that exact slot.
- Activating a category-specific template does NOT deactivate the global template of the same type. They coexist; category-specific wins at auto-build time.
- Global templates (categoryId=null) are separate slots from category-specific templates.

### Auto-Build Changes

**Template source:** `db.pageTemplate.findMany({ where: { isActive: true } })` replaces `db.landingPage.findMany({ where: { isActiveTemplate: true } })`.

**Category dedup:** Same logic as current — if a category-specific template exists for a `templateType`, the global one is skipped for that type. Otherwise, global fallback is used.

**Missing template behavior:** If no template exists for a given `templateType` (neither category-specific nor global), that type is silently skipped. The auto-build logs: `No template found for ${templateType} in category ${categoryName || 'global'}`. Workshop still advances to PRE_EVENT with whatever pages were generated. This is expected — not every workshop needs every page type.

**Page creation:** Created `LandingPage` records now include `sourceTemplateId` (new field, see below) pointing back to the `PageTemplate` they were cloned from. Status is `PUBLISHED` (see Fix #2).

### New Field: `LandingPage.sourceTemplateId`

```prisma
sourceTemplateId String?  // Tracks which PageTemplate this page was cloned from (informational)
```

No FK constraint — purely informational. Used for:
- Template delete warning: "This template was used to generate 3 workshop pages."
- Debugging: which template version produced a given page.

### API Routes

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/page-templates` | GET | List all (filter by categoryId, templateType) | Admin |
| `/api/page-templates` | POST | Create new template | Admin |
| `/api/page-templates/[id]` | GET | Template detail | Admin |
| `/api/page-templates/[id]` | PATCH | Update name/content/categoryId/isActive | Admin |
| `/api/page-templates/[id]` | DELETE | Delete (only if isActive=false) | Admin |

**PATCH activation flow:**
1. Begin Prisma `$transaction`
2. If `isActive: true` in payload:
   a. Find active template where `templateType = target.templateType AND categoryId = target.categoryId`
   b. Deactivate it (set `isActive: false`)
   c. Activate the target template
3. Update other fields (name, content, categoryId)
4. Commit transaction

**DELETE guard:**
- Reject if `isActive: true` (400)
- Query `LandingPage` where `sourceTemplateId = template.id` and return count in response as a warning: `"This template was used to generate N workshop pages. They will not be affected."`
- Deletion proceeds (informational warning, not blocking)

### Admin UI

**Templates list page (`/templates`):**
- Query `PageTemplate` instead of `LandingPage`
- Category tabs (Global, AI, Exit, etc.)
- Each template card: name, type badge, active/inactive status toggle, Edit/Delete actions
- "Create New Template" button

**Template editor page (`/templates/[id]/edit`):**
- Loads `PageTemplate` by ID
- Renders appropriate visual editor based on `templateType` (reuse existing solo-landing-page, registration-page, etc. editor components)
- Editors adapted to accept `PageTemplate` context instead of requiring `workshopId`
- Editors receive template content + preview data from `TEMPLATE_PREVIEW_DATA` constant
- Save button PATCHes `/api/page-templates/[id]` with updated content
- Preview mode: `{{variable}}` placeholders replaced with sample data from `TEMPLATE_PREVIEW_DATA`
- Edit mode: raw `{{variable}}` placeholders visible in content

**Create template page (`/templates/new`):**
- Form: name, templateType dropdown, category dropdown (optional — blank = global)
- Option to start blank or clone content from an existing template
- On save: POST `/api/page-templates`

### Template Preview Data

New file: `src/lib/template-preview.ts`

```typescript
export const TEMPLATE_PREVIEW_DATA: Record<string, string> = {
  coach_name: "Jane Smith",
  coach_first_name: "Jane",
  coach_last_name: "Smith",
  coach_bio: "Jane is a certified Scaling Up coach with 15 years of experience...",
  coach_email: "jane@example.com",
  coach_linkedin: "https://linkedin.com/in/jane-smith",
  coach_photo: "/placeholder-coach.jpg",
  coach_company: "Smith Consulting LLC",
  coach_title: "Scaling Up Certified Coach",
  workshop_title: "Sample: Scaling Up Masterclass",
  workshop_description: "An intensive workshop on the Rockefeller Habits...",
  workshop_date: "January 15, 2027",
  event_time: "9:00 AM - 12:00 PM",
  venue_name: "Grand Conference Center",
  venue_address: "123 Business Blvd, Suite 500, New York, NY 10001",
  virtual_link: "https://zoom.us/j/example",
  workshop_code: "WS-2027-DEMO",
  category_name: "AI Workshop",
  price: "$349",
  pricing_tier_name: "Half-Day Workshop",
  registration_url: "https://example.com/register",
  // camelCase aliases
  coachName: "Jane Smith",
  workshopTitle: "Sample: Scaling Up Masterclass",
  workshopDate: "January 15, 2027",
  eventTime: "9:00 AM - 12:00 PM",
  venueName: "Grand Conference Center",
  venueAddress: "123 Business Blvd, Suite 500, New York, NY 10001",
};
```

### Migration Strategy

**Data migration script:** `prisma/migrate-templates-to-page-template.ts`

1. Query all `LandingPage` where `isActiveTemplate = true`
2. For each record:
   - Create `PageTemplate` with `templateType = record.template`, `content = record.content`, `categoryId = record.categoryId`, `isActive = true`
   - Set `name` = `"{Category.name || 'Global'} {templateType}"` (e.g., "Global Solo Landing Page")
   - Validate: if content does NOT contain `{{`, flag for manual review (likely hardcoded workshop data)
3. Set `isActiveTemplate = false` on migrated `LandingPage` records (don't delete)
4. Log: "Migrated N templates. M flagged for review."

**Seed script updates:** `seed-templates.ts` and `seed-ev-templates.ts` create `PageTemplate` records directly. Remove fake workshop (WS-TMPL-0001, WS-TMPL-EV01) creation logic.

### Deprecation

After this iteration is shipped and verified:
- `LandingPage.isActiveTemplate` becomes unused (can be removed in future migration)
- `LandingPage.categoryId` becomes unused for template purposes (keep if used for other queries)
- Fake template-host workshops can be cleaned up

These are NOT part of this iteration — they're documented for future cleanup.

---

## Fix #2: Coach Bio Validation + Auto-Publish + Post-Approval Lockdown

### Problem

Coaches can submit workshop requests with empty bio data. Auto-built landing pages show blank coach sections. Pages are created as DRAFT requiring manual publish. Coaches can still edit workshops after approval.

### Schema Change

Add to Coach model:
```prisma
title String?  // Professional title/credentials, e.g., "Scaling Up Certified Coach"
```

Migration: `add_coach_title_field`

This is separate from the existing `company` field (which is the coach's business entity, e.g., "Smith Consulting LLC").

### Bio Completeness Validation

**New Zod schema** in `src/lib/validations.ts`:

```typescript
// Coerce null → undefined so Zod emits custom messages instead of generic "Expected string, received null"
const nullToUndefined = (v: unknown) => (v === null || v === "" ? undefined : v);

export const coachBioCompleteSchema = z.object({
  firstName: z.preprocess(nullToUndefined, z.string().min(1, "First name is required")),
  lastName: z.preprocess(nullToUndefined, z.string().min(1, "Last name is required")),
  email: z.preprocess(nullToUndefined, z.string().email("Valid email is required")),
  title: z.preprocess(nullToUndefined, z.string().min(1, "Professional title is required")),
  linkedinUrl: z.preprocess(nullToUndefined, z.string().url("LinkedIn URL is required")),
  bio: z.preprocess(nullToUndefined, z.string().min(10, "Bio must be at least 10 characters")),
  profileImage: z.preprocess(nullToUndefined, z.string().url("Profile photo is required")),
});
```

**Helper function:**
```typescript
export function getCoachBioMissingFields(coach: {
  firstName: string; lastName: string; email: string;
  title: string | null; linkedinUrl: string | null;
  bio: string | null; profileImage: string | null;
}): string[] {
  const result = coachBioCompleteSchema.safeParse(coach);
  if (result.success) return [];
  return result.error.issues.map(i => i.message);
}
```

Required fields (7): firstName, lastName, email, title, linkedinUrl, bio, profileImage.

### Validation Touchpoints

**1. Client-side gate — Coach request page (`/portal/request/page.tsx`):**
- Expand coach query to include `title`, `company`, `linkedinUrl`, `bio`, `profileImage`
- Call `getCoachBioMissingFields(coach)`
- If missing fields exist → render blocking banner:
  - Heading: "Complete Your Profile First"
  - List of missing fields
  - Link to `/portal/settings`
- Form component (`<NewWorkshopForm>`) is NOT rendered until bio is complete

**2. Server-side gate — Approvals POST (`/api/approvals/route.ts`):**
- After resolving `coachId`, fetch coach bio fields
- Run `getCoachBioMissingFields(coachRecord)`
- Return 400 with `{ error, missingFields }` if incomplete
- Prevents API-level bypass

**3. Profile form + API update (`CoachProfileForm` + `PATCH /api/portal/profile`):**
- The existing profile form has "Title / Credentials" which maps to `coach.company` (business entity)
- The new `Coach.title` field is separate (professional title/credentials)
- Add a "Professional Title" input to the profile form that saves to `coach.title`
- Update the profile PATCH API to accept `title` in its Zod schema
- Without this, coaches have no way to set the `title` field and bio validation permanently fails

**4. Settings page enhancement (`/portal/settings/page.tsx`):**
- Add a "Profile Completeness" section at the top of the settings page
- Display a checklist of the 7 required fields with green checkmark for filled, red X for missing
- Below the checklist, show a message: "Complete all required fields to request workshops" (only when incomplete)
- Required field labels in the form itself get a red asterisk (*) to indicate they're mandatory for workshop requests

### Auto-Publish on Approval

In `auto-build-workshop.ts`, change page creation:

```typescript
// Before:
status: "DRAFT",

// After:
status: "PUBLISHED",
publishedAt: new Date(),
```

Pages go live immediately when Suzanne approves. No intermediary review step. The `sendWorkshopBuiltEmail()` coach notification already includes page links — now pointing to live pages.

### Post-Approval Coach Lockdown

**Locked statuses:** `PRE_EVENT`, `POST_EVENT`, `COMPLETED`
**Unlocked statuses:** `REQUESTED`, `INFO_REQUESTED`, `AWAITING_APPROVAL`, `CANCELED`

**PATCH `/api/workshops/[id]` — edit lockdown:**
After coach ownership check, add:
```typescript
if (isCoach) {
  const LOCKED_STATUSES = new Set(["PRE_EVENT", "POST_EVENT", "COMPLETED"]);
  if (LOCKED_STATUSES.has(existing.status)) {
    return NextResponse.json({
      success: false,
      error: "This workshop is approved and locked. Contact admin for changes.",
    }, { status: 403 });
  }
}
```

**DELETE `/api/workshops/[id]` — cancel lockdown:**
Same check in the DELETE handler. Coaches cannot cancel approved workshops. Cancellation of approved workshops goes through Suzanne.

**Pricing changes (also locked):**
The PATCH lockdown is placed BEFORE the `COACH_PRICING_FIELDS` interception code. Coaches cannot request custom pricing changes on approved workshops. Any pricing changes on approved workshops must go through Suzanne.

**Unregister (no change):**
`DELETE /api/registrations/[id]` remains accessible. This is the one action Jeff explicitly wants coaches to keep post-approval.

### Coach Portal UI Changes

**Workshop detail page (`/portal/workshops/[id]/page.tsx`):**
When status is `PRE_EVENT`, `POST_EVENT`, or `COMPLETED`:
- Edit buttons/forms rendered as **disabled** with tooltip: "Workshop is approved. Contact admin for changes."
- Cancel button rendered as **disabled** with same tooltip
- Unregister buttons remain fully functional
- Subtle info banner at top: "This workshop is approved. Only attendee management is available. For other changes, contact your admin."

**What coaches CAN do post-approval:**
- Unregister attendees
- View workshop details (read-only)
- View survey results
- View workflow execution status
- Download ICS calendar files

**What coaches CANNOT do post-approval:**
- Edit any workshop field
- Cancel the workshop
- Resubmit the workshop

---

## Fix #3: Price Display on Coach Portal

### Change

**File:** Coach workshop detail page (`/portal/workshops/[id]/page.tsx`)

Add `pricingTier: { select: { name: true, amountCents: true } }` to workshop query.

Add "Price" row in Event Details card (after Format):
- `isFree` → "Free"
- Has `pricingTier` → "$349 — Half-Day Workshop" (amount + tier name)
- Has `priceCents` but no tier → formatted amount only
- Neither → "TBD"

Read-only. Single-file change. Uses existing `formatUsdFromCents()`.

---

## Fix #4: Admin Edit Propagation Enhancement

### Verification Result

Admin can already edit all workshop fields at any status. R4B sync re-interpolates landing pages on logistics field changes (eventDate, eventTime, timezone, virtualLink, venueName, venueAddress). Jeff confirmed date changes work.

### Enhancement

**Add title/description to R4B sync trigger list:**

In PATCH route, change syncFields:
```typescript
// Before:
const syncFields = ["eventDate", "eventTime", "timezone", "virtualLink", "venueName", "venueAddress"] as const;

// After:
const syncFields = ["title", "description", "eventDate", "eventTime", "timezone", "virtualLink", "venueName", "venueAddress"] as const;
```

**Add structured field mappings to `buildWorkshopVariables()`:**

In `template-interpolation.ts`, add to the variables map:
```typescript
heroTitle: workshop.title,
heroSubtitle: workshop.description || "",
aboutDescription: workshop.description || "",
```

This ensures admin edits to title/description propagate to both `{{placeholder}}` text and structured JSON keys in solo-landing templates.

---

## Testing Strategy

### New Test Files

| File | Coverage |
|------|----------|
| `__tests__/lib/coach-bio-validation.test.ts` | Complete/incomplete profiles, edge cases (empty strings, null values, short bio) |
| `__tests__/api/page-templates.test.ts` | CRUD, activation slot management, category scoping, delete warnings |

### Updated Test Files

| File | Changes |
|------|---------|
| `__tests__/inngest/auto-build-workshop.test.ts` | Template source is `PageTemplate`, pages created with `PUBLISHED` status, `sourceTemplateId` set |
| `__tests__/api/workshops.test.ts` | Coach lockdown at PRE_EVENT (PATCH 403, DELETE 403), admin still allowed |

### Acceptance Criteria

**Fix #1:**
- [ ] Admin can create a template without creating a workshop
- [ ] Admin can delete a template without affecting existing workshops
- [ ] Two different workshops approved using the same template get correct pages
- [ ] Template admin UI shows templates organized by category and type
- [ ] Global fallback works when no category-specific template exists
- [ ] Missing template type silently skipped (logged, not errored)
- [ ] Partial unique index prevents two active templates in same slot

**Fix #2:**
- [ ] Coach with incomplete bio cannot submit workshop request (client + server blocked)
- [ ] Coach with complete bio can submit workshop request
- [ ] On approval, all pages publish automatically (status = PUBLISHED)
- [ ] Published pages display coach bio data correctly
- [ ] Coach cannot edit workshop details after approval (403)
- [ ] Coach cannot cancel workshop after approval (403)
- [ ] Coach CAN unregister attendees after approval
- [ ] Admin CAN still edit all fields after approval

**Fix #3:**
- [ ] Coach views workshop and sees price displayed
- [ ] Price shows tier name + amount, or "Free", or "TBD"

**Fix #4:**
- [ ] Admin changes title → landing page updates
- [ ] Admin changes description → landing page updates
- [ ] Existing logistics sync (date, time, venue) still works

---

## Implementation Order

| Phase | Fixes | Estimated Effort |
|-------|-------|-----------------|
| Phase 1: Quick wins | Fix #3 (price display), Fix #4 (title/description sync) | ~1.5 hours |
| Phase 2: Bio + lockdown | Fix #2 (bio validation, auto-publish, coach lockdown) | ~4-5 hours |
| Phase 3: PageTemplate model + API | Fix #1 (schema, migration, API routes, auto-build) | ~6-8 hours |
| Phase 4: Template editor UI | Fix #1 (admin UI rewrite, visual editor adaptation) | ~4-6 hours |
| Phase 5: Cleanup (future) | Deprecate `isActiveTemplate`, clean up fake workshops | ~1 hour |

Total estimated: 16-22 hours.

---

## Risk Assessment

| Fix | Risk | Mitigation |
|-----|------|------------|
| #1 (PageTemplate) | Highest — schema migration, auto-build rewrite, admin UI overhaul | Data migration script is idempotent. Old LandingPage templates kept as fallback. |
| #2 (Bio + lockdown) | Medium — touches submission flow and access control | Server-side validation prevents API bypass. Coach lockdown tested for both PATCH and DELETE. |
| #3 (Price display) | None — display-only change | N/A |
| #4 (Admin edit sync) | Low — adding fields to existing sync mechanism | R4B sync is already try/catch non-blocking. |

---

## Files Affected

### New Files
- `src/app/api/page-templates/route.ts`
- `src/app/api/page-templates/[id]/route.ts`
- `src/app/(dashboard)/templates/[id]/edit/page.tsx`
- `src/app/(dashboard)/templates/new/page.tsx`
- `src/lib/template-preview.ts`
- `prisma/migrate-templates-to-page-template.ts`
- `src/__tests__/lib/coach-bio-validation.test.ts`
- `src/__tests__/api/page-templates.test.ts`

### Modified Files
- `prisma/schema.prisma` — PageTemplate model, Coach.title, LandingPage.sourceTemplateId
- `src/inngest/functions/auto-build-workshop.ts` — Use PageTemplate, PUBLISHED status
- `src/app/api/workshops/[id]/route.ts` — Coach lockdown, title/description R4B sync
- `src/app/api/approvals/route.ts` — Server-side bio validation
- `src/app/api/portal/profile/route.ts` — Accept Coach.title in PATCH
- `src/lib/validations.ts` — coachBioCompleteSchema (with null coercion)
- `src/lib/template-interpolation.ts` — heroTitle/heroSubtitle mappings
- `src/app/(portal)/portal/request/page.tsx` — Bio gate
- `src/app/(portal)/portal/workshops/[id]/page.tsx` — Price display, disabled controls
- `src/app/(portal)/portal/settings/page.tsx` — Bio completion indicator
- `src/components/coach/coach-profile-form.tsx` — Add Coach.title field
- `src/app/(dashboard)/templates/page.tsx` — Rewrite for PageTemplate
- `prisma/seed-templates.ts` — Create PageTemplate directly
- `prisma/seed-ev-templates.ts` — Create PageTemplate directly
- `src/components/templates/active-template-toggle.tsx` — Adapt for PageTemplate
