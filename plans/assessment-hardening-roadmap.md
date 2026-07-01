<!-- ROADMAP_ISO:2026-07-01 ROADMAP_SLUG:assessment-hardening -->
# Assessment Module — Hardening Roadmap (SoT)

> **This file is the source of truth for the assessment-module hardening effort.**
> The visual roadmap artifact is a *render* of this doc — change the doc, re-render the view.
> Tasks (GitHub Issues + Notion) are the execution layer, born from the findings below once stable.

| Key | Value |
|-----|-------|
| **Owner** | Gabriel (gabriel@chiefaiofficer.com) |
| **Driver** | **Correctness / data-integrity first** (user-chosen 2026-07-01) |
| **Editor operator** | **Any admin** (2026-07-01, refined Q3) — the concern is the editor is *daunting/unfriendly*, NOT that people are incapable. Fix = approachability (de-jargon + progressive disclosure + good starting points), **not** a technical/non-technical role split |
| **Origin** | Live torture-test sweep of the assessment admin + coach surfaces (2026-07-01) |
| **Status** | v0.9 draft — five-phase skeleton locked; sweep in progress will add items to P0/P2 |
| **Sequencing principle** | Fix what shipped → protect the data → finish what's half-built → build the new surfaces → make it beautiful |

---

## Why this order (and the alternative we rejected)

**Chosen:** foundation before features before polish. Correctness bugs on already-shipped
features come first, then the data-integrity guardrails, then finishing the half-built
surfaces, then the new "coming soon" capabilities, then the visual redesign.

**Rejected:** "build the coming-soon features first" (Campaigns / Organizations / Public
Quizzes — more visible, more demo-friendly). Stacking new surfaces on unguarded data
integrity is how the next P0 gets born. If a **Jeff demo** forces a specific feature
forward, pull just that item into an earlier phase and note the exception here.

---

## Operating model — Clone-and-tweak, made approachable (decided 2026-07-01; refined per Q3)

**Q3 correction (2026-07-01):** the concern was never that admins are *incapable* of technical
work — "anyone can learn to be technical." The problem is the editor **looks daunting and is not
user-friendly.** So the fix is **approachability, not a role split.** We are **NOT** splitting
people into "technical author" vs "non-technical admin," and **NOT** role-gating the deep editor.

The model:
1. **Clone-and-tweak as a friendliness scaffold** — an admin starts from a **vetted template**
   (everything pre-filled) instead of a blank, intimidating form, and changes only what they need.
   Good starting points lower fear; they are not a capability wall.
2. **Progressive disclosure, not role gates** — the advanced parts (scoring math, question types,
   conditional logic) sit behind sensible **defaults** and "advanced" affordances, available to
   **anyone** who wants them — calm by default, never locked by role.
3. **Plain language throughout** — de-jargon (F2) so the tool reads like a product, not an
   engineering console.

Still the Culture Amp / Qualtrics template-library *spirit* (start from vetted content), but its
purpose is **lowering the daunting-ness for every admin**, not shielding a role from complexity.

**Resolved (was an open sub-decision):** no "technical author vs non-technical admin" role split.
One editor, made approachable for any admin.

---

## Phases

### Phase 0 · Fix what shipped  — *live bugs on today's features (days)*
- **F1** — before-section slide placement dead for every template (`"en"` vs `"enUS"` language drift). One-line fix + hoist the shared constant + regression test.
- **H1** — unify coach-identity resolution (UI matches by email, API by `Coach.userId` FK — they must not be allowed to diverge).
- *(+ any confirmed bug the remaining sweep surfaces.)*

### Phase 1 · Protect the data — *the heart of correctness-first*
- **Version lifecycle done right:** archive (never hard-delete) + block-delete-while-referenced; a real **unpublish / rollback** with a loud "this can invalidate later responses" warning (per research — Qualtrics/Typeform norm).
- **Save-Draft atomicity:** replace the parallel-PATCH partial-save with all-or-nothing + clear recovery, so a half-failed save can't corrupt a template.
- **Immutability + longitudinal-comparability guardrails** audited end-to-end (published truly locked; Wave N deltas can't be silently broken).

### Phase 2 · Finish & explain what's already there — *stop the "looks broken" confusion*
- **Published-lock legibility:** explain *why* editing is greyed; one clear "Duplicate to edit" affordance; collapse the View==Edit twins.
- **Results-email gate actionable:** the coach's "ask an admin" should point somewhere; the admin approval toggle should be discoverable.
- **H2** — Custom Slides copy: "Branded pages only — not questions; they collect no answers and don't affect scores."
- **Resolve the disabled surfaces:** decide the fate of the v1.5 question types (NUMBER / MULTI_CHOICE / TEXT / COMPOUND) and Conditional Logic — finish them, or hide the dead options cluttering the editor (today Conditional Logic sends admins into raw Prisma Studio).
- **De-jargon the admin-visible surfaces (F2):** on the clone-and-tweak flow + anything a non-technical admin sees, replace engineering vocabulary (`stableKey`, `minMetric`/`maxMetric`, `overallAvg`, `Pass Threshold`, `SLIDER_LIKERT`, content-hash strings, Zod errors) with plain labels + help. These plain-language fixes apply to the whole editor — any admin may use it, so nothing is role-gated (see P4).
- **Surface the active version (F3) — DECIDED (Q2 → option A, all templates):** LIVE badge on the latest-published version (the one new campaigns pin), older published versions marked "Published · superseded (still serving their pinned campaigns)", fill the template-list "Active version published" column (shows "—" today), and a Publish confirmation that says *"this becomes the live version for new sends."* **Correction is forward-only** — no manual active-version switch, no reactivating an older version (comparability, ADR-0016). Data model unchanged — visibility only. Glossary term added: **Active version**.

### Phase 3 · Build the "coming soon" surfaces — *new capability, in dependency order*
- **Campaigns** — admin oversight view of every coach's campaigns.
- **Organizations** — admin org management (foundational for multi-org).
- **Public Quizzes** — public-access assessments; reconcile the half-built `public-campaigns` page + the dead `public-quizzes` nav link (**H3**).
- **Import → coach-side, the WHOLE flow** (decided 2026-07-01; supersedes glossary "admin-operated" — **ADR-0017**, written). Org-scoped (a coach imports only into their own companies), staging-first. Roster + QSP-v2 results were the only working instruments as of this roadmap's original writing — **corrected 2026-07-01**: SU-Full historical import is now built as **Wave O** (see root `PLAN.md` + `docs/specs/v7.6/18o-ops-runbook.md`), Phase 1 complete (dark — flag `WAVE_O_ESPERTO_SUFULL_IMPORT` off, crosswalk `locked:false`), Phase 2 (the real positional mapping + lock-checklist) still to come; Rockefeller/LVA remain parked on Jeff's sample exports. **The crosswalk is the one dangerous step** (Esperto exports carry no question text, so a wrong code→stableKey map silently attaches answers to the wrong questions → corrupts historical results + longitudinal, ADR-0016). Wave O's guardrails, as actually implemented (not just proposed): a coach-supplied **round label** is the stable round identity (the export has no round/wave field); **explicit target-org selection** — never inferred from file contents (a coach picks the org; the org's Esperto `cid` is pinned on first import and mismatches block); entitlement parity with normal campaign-create (`canCreateCampaign`, re-checked in-transaction); exact/superset/divergent reuse classification (a changed or missing respondent on re-import 409s — never silently overwritten); per-round advisory-lock serialization; a by-batch quarantine/purge rollback path; imported campaigns are CLOSED + never email (ADR-0006). Per-template crosswalks are authored once and reused — the crosswalk itself is what's locked, not a role gate.

### Phase 4 · Make the editor approachable — clone-and-tweak + progressive disclosure — *the `/frontend-design` pass*
Per the Q3 correction, this is a **usability** effort for ANY admin — not a role-gating or template-copy subsystem:
- **Template gallery** of vetted templates, with **Start from this / Duplicate** — admins begin from a filled-in, friendly starting point, never a blank intimidating form.
- **Progressive disclosure:** scoring, question types, and conditional logic sit behind sensible defaults + "advanced" affordances — present for anyone who wants them, not locked by role, not thrown in your face by default.
- **De-jargon + plain language** everywhere (F2), live preview, sane defaults — so the whole editor reads like a product, not an engineering console.
- **No role gate, no separate "technical author"** — one editor, made calm enough that any admin can go as deep as they choose.
- **Design tooling:** `/frontend-design` (in-repo; respects `globals.css` tokens + shadcn/ui + the CLAUDE.md semantic-color rules; consistent with the Wave M pipeline). **Builder.io not adopted** — it's for visual/CMS page-building and non-dev layout authoring, not data-wired guarded admin surfaces. Revisit only for marketing/landing pages or Figma→code conversion.

---

## Findings ledger

| ID | Type | Finding | Phase | Status |
|----|------|---------|-------|--------|
| **F1** | 🐛 bug | "Before section" slide placement unreachable for all templates — `version-sections` route filters `language:"en"` but data/create use `"enUS"` → 404 → wizard silently degrades to Start/End. Start/End slides still save; no corruption. | P0 | LOGGED · not started (low blast radius; user chose to keep hunting) |
| **H1** | hygiene | Coach identity resolves two ways (email fallback in UI vs `Coach.userId` FK in API). Agree in prod today (all 7 coaches linked); shouldn't be allowed to drift. | P0 | LOGGED |
| **H2** | polish | Custom Slides step doesn't state slides ≠ questions — confused even the person who shipped it. | P2 | LOGGED |
| **H3** | bug | `public-quizzes` nav points at a non-existent route while a partial `public-campaigns` page is built — nav/route mismatch. | P3 | LOGGED |
| **F2** | 🎨 UX debt | Editor is daunting/unfriendly — engineering vocabulary + power-tool density. **Approach (Q3):** make it approachable for ANY admin — de-jargon + progressive disclosure + start-from-vetted-template defaults. No role split, no locking. | P2 (de-jargon) + P4 (approachability) | LOGGED |
| **F3** | 🐛 clarity | "Published" ≠ "active". Multiple versions can be published at once (by design — publishing is additive; each campaign pins its version). New campaigns silently pin the **highest version number** (`resolvePublishedTemplateVersion`, `orderBy versionNumber desc`), but the Versions tab labels them all "Published" with no active marker and the template list's "Active version published" shows "—" — so an operator can't tell which version is live. | P2 | DECIDED · A (visibility, all templates, forward-only) |

*Non-defects confirmed working-as-designed (do not "fix", only explain in-UI): published-immutability / duplicate-to-edit, results-email admin-approval gate, admin-owns-structure vs coach-owns-branding split. All validated against Qualtrics/SurveyMonkey/Typeform/Culture Amp norms.*

---

## Sidebar → phase map

| Nav item | Status today | Roadmap home |
|---|---|---|
| Dashboard · Access Groups · Aggregate Report | built | — |
| Templates | built | hardened in **P1**, redesigned in **P4** |
| Import | built, admin + coach (roster/QSP live; SU-Full = Wave O, Phase 1 done but dark) | remaining P3 work = Phase 2 crosswalk lock + Rockefeller/LVA (parked) |
| Campaigns *(coming soon)* | stub | **P3** |
| Organizations *(coming soon)* | stub | **P3** |
| Public Quizzes *(coming soon)* | stub + half-built `public-campaigns` | **P3** |

---

## How this is tracked (anti-fragmentation)

- **This doc** = strategic SoT. Edit it here; it is canonical.
- **Visual artifact** = a render/view of this doc. Never edit content only in the artifact.
- **GitHub Issues + Notion** = execution tasks, one granular task per finding, created once the sweep stabilizes.
- **CLAUDE.md** = thin pointer; update the anchor when execution begins (per the SoT-on-push rule).
