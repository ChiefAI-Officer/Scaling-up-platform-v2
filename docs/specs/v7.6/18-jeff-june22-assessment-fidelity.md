# Spec 18 — Esperto Fidelity Reference + Wave Map (Jeff touch-point, June 22 2026)

> **Status: REFERENCE + WAVE LEDGER. No build instructions here.** This captures what the
> Esperto source materials actually specify (so we stop re-deriving from meeting transcripts),
> and assigns every item to a wave. Each wave is still GATED — brainstorm → grill → user
> approval → a per-wave plan before any code.

**Source touch-point:** Fathom call June 22 2026 (Jeff Verdun = "Gabriel G (ChiefAiOfficer.com)"; dev = Gabriel L).
**Ground-truth materials:** `From Jeff/APP_scaling up assessemnt/` (Esperto sample reports + the source workbooks — these ARE the spec; the workbooks are mostly embedded screenshots, not cell data).

---

## A. Source-material index (where the truth lives)

| Assessment | Sample reports | Source workbook | Notes |
|---|---|---|---|
| LVA | `APP_leadership vision alignment assessment/*.pdf` incl. `Leadership_Vision_Alignment_Group_report_*.pdf` | `leadership visin alignment assement.xlsx` (sheet **Questions**) | Group report **shows individuals** |
| Scaling Up Full | `APP_scaling up assessemnt/ScalingUp_*report*.pdf` (full / CEO_Full / condensed / group / selfcomparison / "4 years later") + `other samples/` (all-0s/3s/5s/7s/10s) | `scalingupassessment.xlsx` (screenshots in sheets **v2** / **ScreenShots** / **Summary Report**), `other samples/matrix.xlsx` | Group report **hides individuals** |
| Rockefeller | `APP_Rockerfeller/*.pdf` + `Full Team*.pdf` | `Rockerfeller questions.xlsx` | data-collector (no special logic) |
| QSP v1 / v2 | `APP_qtr session prep v1|v2/*.pdf` | `qtr session prep v1|v2.xlsx` | data-collectors |

Prior related doc: `17e-lva-source-diff.md` (Wave E LVA diff).

---

## B. LVA — conditional-obstacles model ("way too many questions")

**Esperto's *individual* LVA report shows** (from the real PDF): financials matrix → free-text vision
answers → **Obstacles explained for ONLY the checked obstacle factors** (sample: Sales / Cash / Execution)
→ rehire % → strategy free-text → priorities free-text. It does **NOT** render a 16-row factor list in
the individual report.

**Our seed builds** (`src/prisma/seed-lva-assessment.ts`, 8 sections / 51 questions):
- `S1_financials` — 9 NUMBER
- `S2_vision` — 8 TEXT
- `S3_strengths` — **16 SLIDER_LIKERT** (every factor rated Strong/Avg/Weak)
- `S4_obstacles` — **1 MULTI_CHOICE, maxChoices 3** (the obstacle checkbox)
- `S5_explained` — **16 fixed *optional* "Why is [factor] a hindrance?" TEXT** + 2 required TEXT
  (seed comment: *"Since the platform has no conditional logic, all 16 per-factor follow-ups are seeded as OPTIONAL TEXT."*)
- `S6_focus` — 1 NUMBER + 14 TEXT

**Report path:** `report-config.ts` maps LVA → `qualitative`. `lib/assessments/qualitative-report-model.ts`
filters by `isReportAnswerPresent` (answered-only, ~L101–123) and omits empty sections (~L406). Renderers
(`QualitativeReport.tsx`, `report-email.ts`) render whatever the model returns; no extra filter.

**The gap (= Jeff's complaint, two parts):**
1. `S3` 16-factor rating renders all 16 rows — every factor is answered, so answered-only never trims it —
   but Esperto's *individual* report omits that matrix (it's a group-level view).
2. `S5` hindrance follow-ups are **not bound to the `S4` checkbox**. They should appear **only for the ≤3
   checked factors**; today they survive on "did they type text," not "did they check it."

**Fix shape:** report-model filter keyed off the `S4` multi-choice answer (render `S5` only for checked
factors) + a product decision on whether `S3`'s 16-factor rating belongs in the individual report. **No
conditional engine needed.** This is the deferred **`#29 LVA reconcile / conditional-obstacles`** — Jeff
confirmed it on the call.

---

## C. Scaling Up Full — business logic (grounded in the screenshots + group report)

**C-1. Employee-count → growth-phase tile** (Jeff's "pick employee count → get this answer"). After the
background screen, a mid-survey interstitial pops up: **"You've reached phase N – [Name] phase."** Confirmed
by running headcounts through the source screenshots:

| Employees | Phase (verbatim where seen) | Confirmed by |
|---|---|---|
| 1–7 | Phase 1 (name to harvest) | band label |
| 8–24 | **Phase 2 – Organization phase** | 15 employees → P2 |
| 25–49 | **Phase 3 – Management phase** | 40 employees → P3 |
| 50–149 | **Phase 4 – Delegation phase** | 100 employees → P4 |
| 150+ | Phase 5 (name to harvest) | band label |

> Band breakpoints need a final confirm — the workbook cell labels were inconsistent ("8-24" vs "9-49"),
> but the screenshot runs nail 15→P2, 40→P3, 100→P4. P1/P5 narrative text still to harvest from the screenshots.

**C-2. Background + growth inputs** (drive the phase tile + the report header):
- Years in existence; # employees (permanent/temp FTE + freelance FTE); leadership positions filled
  (Finance / HR / Operations / Marketing / Sales / IT / R&D / Other — checkboxes).
- Revenue two-years-ago / last-year / target-this-year (+ computed growth %); revenue next-year /
  target-in-two-years (+ %).

**C-3. Industry benchmarks = the "Peers" column.** The report's "YOUR PROFILE" matrix is
**CEO score · Team avg · Peers · Dev-from-team · Dev-from-peers**, and every question bar shows
**you / team / peers**. The Peers numbers (5.9, 6.3, 7.2…) are the industry benchmark → seed from Jeff's
numbers, store in a **table editable by admins** (so they can retune off aggregate platform data later).

**C-4. Anonymity — SU-Full-ONLY.** The SU Full group report shows **you / team-average / peers** with
**no per-person breakdown** (`Summary Report` sheet, verbatim: *"ceo cannot see individual team members
reports"*). This is the opposite of the **LVA** group report, which lists each person. → anonymity is a
**per-template property**, true for SU Full only.

**C-5. Scored report structure** (unlike LVA's qualitative): 4 Decisions + "You"
(People / Strategy / Execution / Cash / You), each a weighted 0–10 section score, narrative recommendations
per question from the **0/3/5/7/10 bands in `matrix.xlsx`** (already harvested per CLAUDE.md).

> SU Full scope should be **finalized after the owner completes a full SU-Full review**.

---

## D. Other items from the touch-point

- **Coach logo on reports** — if a coach has a logo on their profile, surface it on the report (Jeff leaning
  footer). **OWNER DECISION PENDING** — placement. Mechanically a placeholder lookup once placement is set.
- **Move Esperto historical import admin → coach side — ✅ SHIPPED (June 5 2026, PR #39 same-day follow-up; verified on `main` 2026-06-25).**
  This catalog bullet was STALE when written. The coach-scoped route `POST /api/assessments/import` (`ownerCoachId`
  always from `actor.coachId`, admins rejected, cross-coach isolation) + the `/portal/members/import` page + the
  "Import from Esperto" button on `/portal/members` already handle **both** `kind:"roster"` (people) **and**
  `kind:"results"` (historical reports / past answers — the Roster/Results toggle is rendered in the coach variant
  too, `EspertoImportClient` L320–328). The admin lane (`/admin/assessments/import`) is RETAINED as an admin
  superset for support/backfills. OPEN (owner, optional + tiny): remove the admin entry point so it's coach-only.
- **Auto-send ("create and send") not sending** — NOT new code: Wave D shipped the auto-send engine behind
  default-OFF `WAVE_D_AUTO_SEND_ENABLED`. Launch = flag-flip + the 17d-ops-runbook operator step.

---

## E. WAVE MAP (every item has a home — letters PROPOSED, confirm/adjust)

| Wave | Scope | Status / gate | Source |
|---|---|---|---|
| **H** | Admin nav → grouped dropdowns + **owner-approved preview** before prod. *(Custom-domain `platform.scalingup.com` — needs a wave home: fold into H, or split to a dedicated infra wave — DECISION PENDING.)* | Design grilled; awaiting owner approval. Next: 17h spec + ADR-0013 + plan, then build-go. | June 22 call (nav), prior |
| **I** | **LVA conditional-obstacles fix** (#29) — §B. Jeff's stated #1. | New. Gated: brainstorm → grill → plan. Contained. | §B |
| **J** | **Scaling Up Full business logic** — phase-tile (§C-1), admin-editable benchmark table (§C-3), anonymous group report (§C-4). | New. Gated. **Complete owner review of SU-Full** before locking scope. Meatiest (likely a migration for the benchmark table). | §C |
| **K** | **Coach-facing report items** — coach logo on reports (§D, owner decision on placement) + ~~move Esperto historical import admin→coach~~ (**✅ shipped June 5, PR #39 follow-up — see §D**). | **K.1 import = DONE** (verified on `main` 2026-06-25). Logo awaits owner placement decision. Only residual: confirm owner preference on removing the admin import entry. | §D |
| **(ops)** | **Auto-send launch** — flag-flip `WAVE_D_AUTO_SEND_ENABLED`, no new code. | Launch action, not a build wave. Launch when the owner decides it is ready. | §D |

**Sequencing note (updated 2026-06-25):** Wave **I** (report fix #84 + survey-form conditional follow-on #87/#88/#89)
and the entire **audit-remediation stream** (#81/#82/#83) are ALL shipped to prod on `main` (`cf6195c`). **K.1**
(Esperto import → coach) was already shipped June 5 (PR #39 follow-up). What actually remains: **H** (nav — on
owner approval, preview already sent), **J** (SU Full — on owner review + a benchmark-table migration, so the
Preview-DB-vs-prod separation lands first), and **K.2** (coach logo — awaiting owner placement decision). **No
fully-unblocked product build remains**; the only owner-decision-free code left is the deferred Inngest/ops hardening listed
in CLAUDE.md's "Open follow-ons" (note: two of those — per-recipient pre-send idempotency + immediate-path
`executionId` synthesis — were resolved by audit PR-3 #83 and should be pruned from that list).

---

## F. Open confirmations (owner decisions)
1. Custom domain's wave home (fold into H, or a dedicated infra wave).
2. LVA: does the 16-factor `S3` rating leave the individual report entirely, or stay? (§B gap #1)
3. SU Full: exact employee-count band breakpoints + P1/P5 phase names/text (harvest from screenshots; owner to confirm).
4. Coach logo placement (footer vs elsewhere).

---

## G. Live Esperto tool — confirmations (June 22, read-only login)

Logged into the live white-labeled tool (`scalinguptoolkit.com`, "new interface" v2.0.5) with the
ChiefAIOfficer demo account (doc@chiefaiofficer.com → "Chris Daigle"). Read-only; nothing created/sent.

- **Assessment catalog (real variant list):** Scaling Up Assessment · Leadership Vision Alignment · Quarterly
  Session Preparation · QSP v2 · Rockefeller Habits Checklist · **Enneagram of Personality** (the one we don't seed).
- **IA / nav:** `Home · Members · Campaigns · Reports`. Campaigns grouped by assessment-variant tabs.
- **Lifecycle + progress model — matches ours exactly:** `new → invited → started → completed` (+ total,
  response-rate, avg duration) = our `PENDING/SENT/VIEWED/SUBMITTED` staged-progress mapping. Validated.
- **Campaign detail tabs:** `Participants · Reports · Relations`. **"Relations"** = the participant-linking that
  drives **group reports** (relevant to LVA-group-shows-individuals vs. SU-Full-group-anonymous). Per-participant:
  Token (magic link), Name, Email, Team, Progress, Send-Mail.
- **Demo account has no finished LVA/SU reports** (LVA/SU/QSP campaigns are "started," not completed; only
  Rockefeller completed). → **finished-report authority stays Jeff's exported PDFs** in `From Jeff/…`.
- **Deferred (→ Wave J):** preview the SU Full survey varying employee count to capture exact phase breakpoints
  + P1/P5 tile names/text. Skipped now (Wave J is gated on owner review; would create data in the live tool).
