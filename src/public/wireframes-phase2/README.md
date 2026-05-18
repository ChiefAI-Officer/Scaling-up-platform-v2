# Phase 2 Wireframes (v7.5, Codex co-validated May 12 2026)

Phase 2 of the Scaling Up Assessment Tool wireframes. Replaces the
legacy Esperto assessment platform (contract expires July 1, 2026).

## Purpose

Phase 1 (May 6, 2026) shipped 10 throwaway wireframes covering only the
**Coach lane** of the campaign-creation wizard + campaign detail
(desktop-only, mock data, click-through index).

Phase 2 (starting May 12, 2026) does two things:

1. **Revises** three Phase 1 wireframes per Jeff Verdun's May 8 email
   ("Step 8: Needs visual refinement", and per-screen feedback on two
   others).
2. **Adds** new screens covering the **INVITED + PUBLIC participant
   flows** that Phase 1 didn't touch — the survey-taking experience,
   public lead-capture forms, and tier-gated CTAs.

Phase 2 also introduces a **mobile-first** treatment for
participant-facing and leader-facing screens (Wireframe 08 falls in
this bucket because team leaders may view results on a phone). Mobile +
desktop are rendered side-by-side inside `_shared.css` `.viewport-pair`
frames so reviewers see both adaptations together.

Per the v7.4 Codex co-validate, four admin-side wireframes
(User Setup) were **dropped** — those will be built straight to code
instead. v7.3 had 13 Wave 1 tasks; v7.4 has 9. The May 12 standing
call (Jeff's Figma overview, Admin Tasks lane = 5 placeholder boxes
with zero thumbnails) reversed that v7.4 decision — **Wave 2 (admin
lane, 9 screens) shipped May 13 2026**. v7.5 spec deltas (May 12, Codex
co-validated same day) absorb: CEO anonymity model into v1
(`aggregationMode` + `isCEO`), INVITED results-emailed-back (self-only),
contained `conditionalSections` + `peerBenchmarks` logic-engine shape
(renderer ships v1, admin UI deferred to v1.5), 4 default INVITED
templates (SunHub deferred to v1.5 per Codex co-validate),
`TemplateAccessGrant` (auto-grant INVITED templates only — PUBLIC
excluded), NUMBER + MULTI_CHOICE question types restored.

## Wave 1 status

| #     | Task                                                          | Status |
|-------|---------------------------------------------------------------|--------|
| 1     | Revised 08 — Individual Results (visual refinement)           | [x]    |
| 2     | Revised 02 — Wizard Step 2: Participants (assign-only)        | [x]    |
| 3     | Revised 04 — Public Config (relocated to admin lane)          | [x]    |
| 7     | New — INVITED Participant: Survey Form (mobile + desktop)     | [x]    |
| 8     | New — INVITED Participant: Magic-Link Landing                 | [x]    |
| 9     | New — INVITED Participant: Thank-you                          | [x]    |
| 10    | New — PUBLIC Participant: Quiz Landing (Start-only)           | [x]    |
| 11    | New — PUBLIC Participant: Quiz Form (responsive 0-5 slider)   | [x]    |
| 10.5  | New — PUBLIC Participant: Contact Form (post-quiz lead capture) | [x]  |
| 12    | New — PUBLIC Participant: Results Page (Esperto pattern)      | [x]    |
| W1.5-T2-CEO  | Polish — CEO toggle column on Wireframe 02 (v7.5 anonymity model) | [x]    |
| W1.5-T9-results | Polish — Wireframe 16 thank-you copy reverses GRILL-ME Q5 (INVITED results email) | [x]    |
| W1.5-T12-sunhub-share | Polish — Wireframe 19 banner notes shared `<PublicQuizResultsView>` for SunHub v1.5 | [x]    |

Tasks 4, 5, 6 (admin User Setup) and Task 13 (generalized PUBLIC wizard
chrome) were dropped in v7.4 then **restored as Wave 2 (May 13 2026)**
after the May 12 standing call.

## Wave 2 status — Admin lane (shipped May 13 2026)

| #  | Task                                                          | Status | v1 vs v1.5 |
|----|---------------------------------------------------------------|--------|------------|
| 1  | Admin — Users list (`11-admin-users-list.html`)               | [x]    | v1 surface |
| 2  | Admin — User detail + owned organizations + template access (`12-admin-user-detail.html`) | [x] | v1 surface (v7.6 revised May 15 2026 — Memberships card replaced with read-only "Owned Organizations") |
| 3  | ~~Admin — Memberships per-org grant~~ **REMOVED v7.6 (May 15 2026)** — coaches own their organizations directly; no admin-level membership grants. | [removed] | — |
| 4  | Admin — Templates list (`14-admin-templates-list.html`)       | [x]    | v1 (read-only catalogue) |
| 5  | Admin — Access Groups index (`15-admin-template-access.html`) | [x] | v1 surface (v7.6 redesigned May 15 2026 — pivoted from per-coach template grants to Access Groups with INTERSECTION semantics) |
| 6  | Admin — Template editor: Metadata + Sections (`16-admin-template-editor-meta.html`) | [x] | v1.5 surface |
| 7  | Admin — Template editor: Questions (`17-admin-template-editor-questions.html`) | [x] | v1.5 surface |
| 8  | Admin — Template editor: Scoring + Tiers, Codex-trimmed (`18-admin-template-editor-logic.html`) | [x] | v1.5 surface |
| 9  | Admin — PUBLIC wizard chrome at-a-glance (`20-admin-public-wizard-flow.html`) | [x] | v1.5 surface |

**Codex co-validate trim (May 12)**: Wave 2 Task 8 originally combined
Scoring + Tiers + Conditional Logic. The Codex peer review flagged the
when-clause builder for `conditionalSections` as the highest-complexity
wireframe in Wave 2; that admin UI (plus `peerBenchmarks` value editor)
is deferred to v1.5. The renderer-side evaluation still ships v1
reading seeded JSON; Task 8 shows the deferred editors as ghosted
"Coming in v1.5" placeholder cards so Jeff sees the future shape.

## Wave 3 — Output / report wireframes (deferred)

Per the v7.5 plan: Wave 3 covers the report-rendering surface that ties
the v7.5 deltas together (revised INVITED individual report, CEO
consolidated report for Scaling Up Assessment, coach campaign detail
honoring `aggregationMode`, team aggregate, Trends year-over-year,
printable PDF). Not dispatched yet; sequencing TBD once Jeff's Wave 2
feedback lands.

## Wave 5 status — Admin lane add-ons (shipped May 17 2026)

Wave 5 covers the v7.6 admin-lane additions for the Assessment Tool:
Access Groups list + detail (with `evaluateAccessChange` preview),
admin Aggregate Report (per-template / per-version, v1 MVP shape), and
the platform-nav integration sketch. Each HTML wireframe ships with a
paired markdown spec at `docs/wireframes-phase2/wave5/<NN>-<slug>.md`
that future implementer subagents can load as the contract.

| #  | Task                                                                                | HTML wireframe                                | Paired markdown spec                                                       | Status | v1 vs v1.5 |
|----|-------------------------------------------------------------------------------------|-----------------------------------------------|----------------------------------------------------------------------------|--------|------------|
| 21 | Admin — Access Groups list                                                          | `admin/21-admin-access-groups-list.html`      | `docs/wireframes-phase2/wave5/21-admin-access-groups-list.md`              | [x]    | v1         |
| 22 | Admin — Access Group detail (with `evaluateAccessChange` STATIC preview)            | `admin/22-admin-access-group-detail.html`     | `docs/wireframes-phase2/wave5/22-admin-access-group-detail.md`             | [x]    | v1         |
| 23 | Admin — Aggregate Report (per-template dashboard, v1 MVP shape)                     | `admin/23-admin-aggregate-report.html`        | `docs/wireframes-phase2/wave5/23-admin-aggregate-report.md`                | [x]    | v1 MVP     |
| 24 | Platform Nav — Assessments entry (chrome only, BEFORE/AFTER split view)             | `admin/24-platform-nav-assessments-entry.html`| `docs/wireframes-phase2/wave5/24-platform-nav-assessments-entry.md`        | [x]    | v1         |

**Locked rules** (per `docs/specs/v7.6/05-wireframes-wave5.md`):

- Wireframe 22's `evaluateAccessChange` preview renders as STATIC
  content (not click-driven) so reviewers see the structure without
  interaction.
- Wireframe 23 ships with **TWO selectors only** (template + version).
  No time-range chip, no group filter, no per-org table on day 1 —
  those are deferred to v1.5.
- Wireframe 24 is chrome-only — no mock business data beyond nav
  labels and minimal stat-card placeholders for orientation.
- Each markdown spec opens with the standardized header (spec ref,
  status, paired HTML, service-layer dependencies) and closes with the
  provenance footer pointing to `plans/history/v6-v7.5-archive.md`.

## v7.5 spec reference

The canonical spec for Phase 2 lives in the implementation plan at:

```
~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md
```

Each wireframe inlines a v7.5 spec reference in its top banner (Wave 1
and W1.5 polish edits updated May 12; Wave 2 inline references all v7.5
+ Codex co-validate).

## File layout

```
wireframes-phase2/
├── _shared.css                       # Design tokens + base utilities (inherits Phase 1, adds mobile/desktop frames + .score-bar)
├── index.html                        # Phase 2 click-through landing (Wave 1 + Wave 2 cards)
├── README.md                         # This file
│
├── revisions/                        # Wave 1 — Revised Phase 1 screens
│   ├── 02-revised-participants-assign-only.html    # + W1.5-T2-CEO toggle column
│   ├── 04-revised-public-config-admin-lane.html
│   └── 08-revised-individual-results.html
│
├── participant-invited/              # Wave 1 — INVITED participant flow
│   ├── 14-participant-magic-link-landing.html
│   ├── 15-participant-survey-form.html
│   └── 16-participant-thank-you.html  # + W1.5-T9 results-emailed-back copy
│
├── participant-public/               # Wave 1 — PUBLIC participant flow (Website Assessment)
│   ├── 17-participant-public-landing.html
│   ├── 18-participant-public-quiz-form.html
│   ├── 18a-participant-public-contact-form.html
│   └── 19-participant-public-results.html         # + W1.5-T12 SunHub share note
│
└── admin/                            # Wave 2 — Admin lane (shipped May 13 2026; v7.6 revisions May 15 2026) + Wave 5 (May 17 2026)
    ├── 11-admin-users-list.html
    ├── 12-admin-user-detail.html                  # v7.6: Memberships card → Owned Organizations (read-only)
    │                                              # (the per-org Memberships wireframe was removed v7.6 — coaches own their own orgs)
    ├── 14-admin-templates-list.html
    ├── 15-admin-template-access.html              # v7.6: redesigned as Access Groups index (INTERSECTION semantics)
    ├── 16-admin-template-editor-meta.html
    ├── 17-admin-template-editor-questions.html
    ├── 18-admin-template-editor-logic.html        # Codex-trimmed: Scoring + Tiers only
    ├── 20-admin-public-wizard-flow.html
    ├── 21-admin-access-groups-list.html           # Wave 5 — Access Groups list
    ├── 22-admin-access-group-detail.html          # Wave 5 — Access Group detail (with evaluateAccessChange STATIC preview)
    ├── 23-admin-aggregate-report.html             # Wave 5 — Aggregate Report (per-template, v1 MVP: 2 selectors)
    └── 24-platform-nav-assessments-entry.html     # Wave 5 — Platform nav integration (chrome only)
```

**Paired markdown specs** for Wave 5 live outside `src/public/` so they
are LLM-loadable contracts for future implementer subagents:

```
docs/wireframes-phase2/wave5/
├── 21-admin-access-groups-list.md
├── 22-admin-access-group-detail.md
├── 23-admin-aggregate-report.md
└── 24-platform-nav-assessments-entry.md
```

## Visual conventions

- **Tailwind via CDN** (`https://cdn.tailwindcss.com`) — same as Phase 1
- **Plus Jakarta Sans** via Google Fonts CDN
- **Yellow `WIREFRAME` banner** at the top of every screen (with v7.5
  spec reference)
- **Top-right back link** to `/wireframes-phase2/index.html`
- **Mock data**: realistic Scaling Up domain copy (no lorem ipsum). The
  Rockefeller Habits Checklist fixture from Phase 1 carries through.
- **Self-contained files**: each HTML wireframe has its own `<head>`
  with Tailwind CDN + font CDN + `_shared.css` link. Open any file in
  isolation and it renders correctly.
- **NEW in Phase 2**: mobile-first for participant + leader-facing
  screens. Wireframes that show both render `.viewport-pair` with a
  390px mobile frame and a 1280px desktop frame side-by-side.
