# Visual Template Editor — Design Spec

**Date**: 2026-03-27
**Status**: Draft
**Figma Reference**: Node 2055-13 in XGWICmm1vHjG9tl16RE88X

## Problem

The PageTemplate editor at `/templates/[id]/edit` displays a raw JSON textarea. Admins must understand JSON syntax and field names to edit templates. Jeff's Figma revision: "when you go into >Edit it all shows in code. Must build distinctive, production-grade frontend interfaces."

## Solution

Replace the JSON textarea with a form-based visual editor featuring labeled input fields grouped into Card sections, with a live preview panel that updates as the admin types. The codebase already has this exact pattern for workshop-specific editors — we adapt it for the global PageTemplate context.

## Scope

- 3 template types: SOLO_LANDING, REGISTRATION, THANK_YOU
- 2 files modified: edit page server component + editor client component
- No new files, no API changes, no schema changes

## Architecture

Single client component (`TemplateContentEditor`) with type-based switching. The server component passes `templateType` and parsed content as props.

### Data Flow

```
Load:  DB content (JSON text) → JSON.parse() → form state object
Edit:  User types in input → React setState → preview re-renders
Save:  Form state → JSON.stringify() → PATCH /api/page-templates/[id] { content }
```

The existing PATCH endpoint accepts `{ content: string }` — no backend changes needed.

### Variable Placeholders

Templates use `{{variable}}` placeholders (e.g., `{{coach_name}}`, `{{event_date}}`) that auto-build replaces with real workshop data. In the editor:
- Form fields are pre-filled with placeholder values (e.g., `{{coach_name}}`)
- The preview panel replaces placeholders with sample data via `interpolateContent()` + `TEMPLATE_PREVIEW_DATA`
- An info banner explains the placeholder system

## Layout

5-column grid (matches existing workshop editors):
- **Left (col-span-2)**: Form — Card components with labeled inputs
- **Right (col-span-3)**: Live preview — sticky, scrollable, updates on every keystroke
- **Top**: Template name, type badge, category, active status, and variable info banner

## Field Definitions

### SOLO_LANDING (4 cards, 15 fields)

**Hero Section**
- `heroTitle` — text input, default: `"{{workshop_title}}"`
- `heroSubtitle` — text input, default: `"Build Value. Scale Up. Finish Strong."`

**Coach Info**
- `coachName` — text input, default: `"{{coach_name}}"`
- `coachPhoto` — text input (URL), default: `"{{coach_photo}}"`
- `coachTitle` — text input, default: `"Scaling Up Certified Coach"`

**Event & Content**
- `eventDay` — text input, default: `"{{event_day}}"`
- `eventDate` — text input, default: `"{{event_date}}"`
- `eventTime` — text input, default: `"{{event_time}}"`
- `eventTimezone` — text input, default: `"EST"`
- `aboutTitle` — text input, default: `"Join us for the {{workshop_title}}"`
- `aboutDescription` — textarea (4 rows), default: descriptive placeholder text
- `benefits` — dynamic string array with Add/Remove buttons, default: 4 benefit items

**Video & CTA**
- `videoUrl` — text input (URL), default: empty
- `ctaText` — text input, default: `"Register Here"`

### REGISTRATION (2 cards, 9 fields)

**Hero Section**
- `heroHeadline` — text input, default: `"Virtual Workshop"`
- `heroDescription` — textarea (3 rows), default: descriptive placeholder

**Form Configuration**
- `formTitle` — text input, default: `"Register for the Workshop"`
- `emailPlaceholder` — text input, default: `"Email"`
- `namePlaceholder` — text input, default: `"First and last name"`
- `companyPlaceholder` — text input, default: `"Company"`
- `optInText` — text input, default: `"Keep this box checked to receive future details for this event"`
- `submitButtonText` — text input, default: `"Register Here"`
- `privacyText` — text input, default: `"By registering, you agree to our privacy policy."`

### THANK_YOU (3 cards, 5 fields)

**Content**
- `headline` — text input, default: `"Thank you for Registering for the"`
- `subheadline` — textarea (2 rows), default: `"You'll receive an email shortly with instructions and details for the workshop."`

**Video**
- `videoUrl` — text input (URL), default: empty

**Additional**
- `additionalMessage` — textarea (3 rows), default: empty
- `calendarReminderText` — text input, default: `"Add this event to your calendar so you don't miss it!"`

## Preview Panels

Each template type has its own preview panel JSX, adapted from the existing workshop editors:

**SOLO_LANDING**: Dark sidebar-colored hero with coach photo circle, event details (day/date/time), hero title + subtitle → Content section with about text, benefits checklist (checkmarks), partner section if set → CTA section with register button. Source: `workshops/[id]/landing-pages/solo-landing/page.tsx` lines 470-583.

**REGISTRATION**: 2-column split — left side dark hero with coach photo, name, event details, headline, description; right side form mockup with disabled inputs showing placeholder text, opt-in checkbox, submit button. Source: `workshops/[id]/landing-pages/registration/page.tsx` lines 230-308.

**THANK_YOU**: Full dark (sidebar) background with decorative dots, Scaling Up logo, headline, subheadline, video placeholder (or "no video" dashed box), additional message, calendar reminder text, Google Calendar + Outlook buttons. Source: `workshops/[id]/landing-pages/thank-you/page.tsx` lines 170-257.

## Files Modified

| File | Change |
|------|--------|
| `src/src/app/(dashboard)/templates/[id]/edit/page.tsx` | Server component: fetch template, pass props to client editor. Remove raw JSON preview. |
| `src/src/components/templates/template-content-editor.tsx` | Full rewrite: type-aware form + live preview (~400-500 lines) |

## Existing Code Reused

| What | From |
|------|------|
| Card, CardHeader, CardTitle, CardContent | `@/components/ui/card` |
| Input | `@/components/ui/input` |
| Label | `@/components/ui/label` |
| Button | `@/components/ui/button` |
| TEMPLATE_PREVIEW_DATA | `@/lib/template-preview.ts` |
| interpolateContent | `@/lib/template-interpolation.ts` |
| Preview hero styling (bg-sidebar) | Existing workshop editors |
| Dynamic benefits list pattern | Solo landing editor |
| Error/success banner pattern | All existing editors |

## Verification

1. Navigate to `/templates` → click Edit on Solo Landing → form editor appears
2. Edit fields → live preview updates
3. Click Save → reload page → values persist
4. Repeat for Registration and Thank You templates
5. `npx next build` passes
6. `npm test` passes (no regressions)
7. Playwright screenshots of all 3 editors
