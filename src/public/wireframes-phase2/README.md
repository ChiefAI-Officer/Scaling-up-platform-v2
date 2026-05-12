# Phase 2 Wireframes (v7.4)

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
instead. v7.3 had 13 Wave 1 tasks; v7.4 has 9.

## Wave 1 status

| #     | Task                                                          | Status |
|-------|---------------------------------------------------------------|--------|
| 1     | Revised 08 — Individual Results (visual refinement)           | [x]    |
| 2     | Revised 02 — Wizard Step 2: Participants (assign-only)        | [x]    |
| 3     | Revised 04 — Public Config (relocated to admin lane)          | [x]    |
| 7     | New — INVITED Participant: Survey Start                       | [ ]    |
| 8     | New — INVITED Participant: Survey In-Progress (slider)        | [ ]    |
| 9     | New — INVITED Participant: Survey Complete                    | [ ]    |
| 10    | New — PUBLIC Participant: Landing + Lead-Capture (Website Assessment) | [ ]    |
| 10.5  | New — PUBLIC Participant: Tier-Gated CTA                      | [ ]    |
| 11    | New — PUBLIC Participant: Results (shared `<AssessmentResultView>`) | [ ]    |
| 12    | New — Participant: Resume / Expired Link                      | [ ]    |

Tasks 4, 5, 6 (admin User Setup) and Task 13 (generalized PUBLIC wizard
chrome) were dropped in v7.4.

## v7.4 spec reference

The canonical spec for Phase 2 lives in the implementation plan at:

```
~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md
```

Each wireframe inlines a v7.4 spec reference in its top banner.

## File layout

```
wireframes-phase2/
├── _shared.css                       # Design tokens + components (inherits Phase 1, adds mobile/desktop utilities + .score-bar)
├── index.html                        # Phase 2 click-through landing
├── README.md                         # This file
├── revisions/                        # Revised Phase 1 screens (08, 09, 10)
│   └── 08-revised-individual-results.html
└── new/                              # New Phase 2 screens (Wave 1 tasks 7-12)
    └── (created as tasks land)
```

## Visual conventions

- **Tailwind via CDN** (`https://cdn.tailwindcss.com`) — same as Phase 1
- **Plus Jakarta Sans** via Google Fonts CDN
- **Yellow `WIREFRAME` banner** at the top of every screen (with v7.4
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
