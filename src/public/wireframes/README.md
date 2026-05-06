# Wireframes — Scaling Up Assessment Tool (v7.1)

Static HTML mockups for the **admin assessment-creation wizard** and **campaign detail** views, built May 6, 2026 for stakeholder review (Jeff Verdun) before any production code is written.

## How to view

1. Open `wireframes/index.html` in any modern browser (no server needed).
2. Click any of the 10 screen cards to view that mockup.
3. Each screen has a "← Back to wireframe index" link in the top-right.

## What these are

- **Static HTML files**, one per screen, each self-contained.
- **Tailwind via CDN** (`<script src="https://cdn.tailwindcss.com"></script>`) — no build step.
- **Plus Jakarta Sans** via Google Fonts, matching the live app.
- **Mock data only** — no DB, no business logic, no clickable interactions beyond cross-screen links.
- **Visual style mirrors the existing Scaling Up Platform v2** so the wireframes feel like the same product family.

## What these are NOT

- ❌ Not the actual implementation. v1 will be written against the v7.1 plan, not reverse-engineered from these.
- ❌ Not pixel-perfect designs. They're sketches — proportions, spacing, and layouts will iterate during implementation.
- ❌ Not interactive. Buttons won't do anything. Forms won't submit.
- ❌ Not responsive. Desktop-only (1280px target). Mobile breakpoint not in scope today.

## Screen-by-screen v7.1 spec mapping

| # | Screen | v7.1 spec section |
|---|--------|-------------------|
| 1 | Wizard Step 1 — Template & Organization | `campaign-service.ts → createCampaign(...)`, Q7 nav labels |
| 2 | Wizard Step 2 — Participants (INVITED) | `addParticipants(...)`, recursive `OrgTeam`, `teamPathAtAdd` |
| 3 | Wizard Step 3 — Schedule & Access Mode | `AssessmentCampaign` fields, v6.4 `expiresAt` rule, v7.1 evergreen PUBLIC |
| 4 | Wizard Step 3a — PUBLIC Config | `publicConfig.leadCapture`, `resultsRouting`, `ctaButtons`, v7.1 referring-coach allowlist |
| 5 | Wizard Step 4 — Review & Create | `createCampaign(...)` + optional `inviteRespondents(...)` |
| 6 | Campaign Detail — Overview & Invitations | `AssessmentInvitation` status enum, VIEWED monotonicity |
| 7 | Campaign Detail — Respondents Tab + Expand | per-respondent table, frozen `submission.result` |
| 8 | Individual Results | `<AssessmentResultView>` shared component (also reused for PUBLIC results page) |
| 9 | Team Aggregate Panel | `getCampaignAggregate(...)`, scope filter via `teamPathAtAdd` |
| 10 | Trends Page | template-agnostic Trends with type-aware rendering, `tierMetricValue` composite |

## Design tokens

`_shared.css` mirrors the design tokens from `src/src/app/globals.css`:

- **Primary blue** `#1D4ED8` (HSL 224 76% 48%) — buttons, active nav, primary actions
- **Status pills** — gray PENDING, blue SENT, amber VIEWED, green SUBMITTED
- **Tier pills** — red Low, amber OK, green Great
- **Sidebar** — dark navy (HSL 222 84% 5%) matching the live coach portal
- **Plus Jakarta Sans** — matches the live app (no fallback to Geist)
- **Shadow scale**, radius (`--radius: 0.5rem`), and spacing all align with the live tokens

## Out of scope today

These screens were considered but not built in this session:

- Org / Team / Member CRUD pages (separate deliverable)
- Respondent INVITED survey-taking flow (`/org-survey/[alias]`) — public-facing, different surface
- PUBLIC quiz taker flow (`/quiz/[alias]`) — public-facing, different surface
- Mobile responsive layouts
- Dark mode
- Loading / error / empty states (only happy path shown)

## After approval

Once Jeff signs off on these wireframes, the next steps per v7.1 are:

1. TDD-first scoring engine (Rockefeller golden fixture as the red test)
2. Schema migration `add_assessment_infrastructure_v6_6` (or current name) with all v7.1 deltas
3. Service layer: org-service, org-membership, template-service, campaign-service
4. Admin API routes (Zod-validated, role-gated)
5. Public survey routes (INVITED magic-link cookie + PUBLIC single-POST)
6. Admin UI pages (built from these wireframes as visual reference)
7. Public survey + quiz pages (separate visual track)
