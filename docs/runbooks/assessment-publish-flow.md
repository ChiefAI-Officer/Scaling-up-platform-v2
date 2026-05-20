# Assessment Publish Runbook

Audience: Suzanne / admin operator. This runbook covers publishing assessment template versions, updating tier thresholds on already-published templates, and the specific steps to bring "Scaling Up Full Assessment" live.

This document does NOT explain Rockefeller methodology or scoring theory. It tells you which buttons to click and which guardrails to respect.

---

## 1. Roles

| Who | Decides | Executes |
|-----|---------|----------|
| Jeff | Tier thresholds, tier labels, tier respondent messages, the rollup formula, whether ScaleUp Score (0-100) is shown | (Jeff does not log in.) |
| Admin operator (Suzanne) | Nothing about scoring | All admin UI actions: edit, save, publish, duplicate |

Hard guardrail: **Do not change a tier threshold, tier label, or tier respondent message without Jeff's written sign-off.** Email/Slack confirmation is enough. Save the confirmation alongside any change you make.

If a coach asks you to "tweak the scoring" directly, refuse and route them through Jeff.

---

## 2. How to publish a new template (DRAFT to Published)

This is the path when Jeff has confirmed every threshold and you're ready to flip the version live.

Guardrail before you start: re-read Jeff's confirmation email. Confirm the numbers in the editor match the numbers in his email.

Steps:

1. Sign in as an admin.
2. Navigate to `/admin/assessments/templates`.
3. Click the template you intend to publish. You will land on the template detail page.
4. Find the version row marked as DRAFT.
5. Click **Publish** on that row.
6. Confirm the dialog.
7. One of two things happens:
   - Success toast: "Version published". The badge flips from DRAFT to Published. The version is now live and coaches can build campaigns against it.
   - Failure modal: shows one or more validation issues. See section 5 below.

Once a version is Published, it is **immutable**. You cannot edit its sections, questions, tiers, or scoring config. The Edit button on a published row is read-only.

---

## 3. How to update tier thresholds on a published template

You cannot edit a Published version. The required sequence is **Duplicate to Edit to Publish**.

Guardrail before you start: get Jeff's sign-off on the new thresholds. Do not eyeball "small adjustments" yourself.

Steps:

1. Navigate to `/admin/assessments/templates`.
2. Open the template detail page for the template you want to update.
3. Find the currently Published version row.
4. Click **Duplicate**. This creates a new DRAFT version with the next version number (e.g., v2 if the published version was v1). The content is copied byte-for-byte from the published version.
5. You are now on (or can navigate to) `/admin/assessments/templates/<template-id>/versions/<new-draft-id>/edit`.
6. Open the relevant tier card. For per-domain thresholds, open the collapsible domain section. For global thresholds, use the global tiers list at the bottom of scoring config.
7. Enter Jeff's new values into the affected tier(s). Pay attention to:
   - `minMetric` / `maxMetric` must touch (no gap, no overlap) across tiers
   - Tier `label` must not be empty
   - Tier `message` (the respondent-facing text) must not be empty
8. Click **Save**. Wait for the toast.
9. Navigate back to the template detail page.
10. Click **Publish** on the new DRAFT row.
11. On success, the new version is live. The old published version stays in the list as a historical record.

Important: submissions completed under the old version stay scored using the old version's tiers. Only new campaigns built against the new version will use the new thresholds. This is intentional — past results don't shift retroactively.

---

## 4. Scoring config terms in plain language

These terms appear in the editor and in failure modals. Suzanne does not need to derive them; this is a glossary.

- **Tier** — a bucket that a score falls into. Each tier has three pieces:
  - a **label** (e.g., "Strong", "Developing", "At Risk") — internal name
  - a **message** — the text shown to the respondent on the report
  - a **range** — `minMetric` and `maxMetric` (numbers). A score of `X` lands in this tier when `minMetric <= X <= maxMetric` (the engine's exact comparison is set per template; treat the range as "this tier covers this band").

- **Global tiers** — the tiers applied to the **overall** score (the single headline number for the whole assessment). The overall score is computed by the template's rollup (see below).

- **Domain** — a top-level category inside the assessment. For Scaling Up Full, the five domains are **People, Strategy, Execution, Cash, You**. Each domain has its OWN tier set; a respondent gets one tier per domain plus one overall tier.

- **Rollup** — the formula that produces the overall score from the underlying answers. For Scaling Up Full the rollup is **"mean of domain means"**: each domain's average is calculated first (e.g., the average of all People answers), and then the five domain averages are averaged together to produce the overall.

- **ScaleUp Score (0-100)** — the overall canonical metric multiplied by 10, so a 0-10 average shows as a 0-100 headline number on the respondent's profile page. This is the number Jeff refers to as "the ScaleUp Score". It is opt-in per template; for Scaling Up Full it is enabled.

You do not need to change rollup, domain definitions, or the ScaleUp Score toggle from the UI. Those are set at seed time. If Jeff ever asks for one of these to change, escalate — it is not a runbook task.

---

## 5. What to do when the publish modal shows validation issues

The publish modal lists each problem with a **path** (where in the data the problem is) and a **message** (what's wrong). The fix flow is always the same:

1. Read the path. Identify whether the issue is in a question, a section, a domain's tiers, or the global tiers.
2. Close the modal.
3. Navigate into the editor for the same DRAFT version.
4. Locate the field. The editor's sections mirror the path.
5. Fix the value.
6. Click **Save**. Wait for the toast.
7. Navigate back to the template detail page and click **Publish** again.

Common cases and what they mean:

- **"Domain 'X' has a gap between tiers"** — Two adjacent tiers in domain X don't touch. Example: tier A is `0-3`, tier B is `4-6`. There's a gap at the boundary. Fix: adjust `minMetric`/`maxMetric` so the boundary aligns (e.g., A is `0-3`, B is `3-6`, with the engine handling the boundary).
- **"Recommendation band overlaps"** — Two recommendation bands on the same question cover the same score. Fix: adjust the edges of the affected bands so they don't overlap.
- **"Section 'Y' references domain 'Z' which is not defined"** — A section has a `domain` key that doesn't match any key in `scoringConfig.domains`. Fix: either rename/remove the domain reference on the section, OR ensure the domain exists in scoring config. **Adding a domain to `scoringConfig.domains` is not in the admin UI scope** — escalate to engineering.
- **"Tier missing label" / "Tier missing message"** — A tier label or message is blank. Fix: enter the text Jeff confirmed.
- **"ScaleUp Score requires 0-10 scale"** — Some question on the template uses a scale outside 0-10 while ScaleUp Score is enabled. Fix: escalate to engineering; this is not a runbook task.

If a validation message doesn't match any of the above, screenshot the modal and send it to engineering with the template name and version number. Do not guess at the fix.

---

## 6. Specific instructions for Scaling Up Full

Current state of the "Scaling Up Full Assessment" template: **DRAFT v1**, with tier thresholds present but marked as placeholders pending Jeff's confirmation. The template has been seeded with all 61 questions across 5 domains and 10 sections. The per-question score-band recommendation text is already populated from Jeff's source materials.

What is NOT confirmed and must be entered by you, with Jeff's sign-off:

- **20 per-domain tier thresholds** — 5 domains (People, Strategy, Execution, Cash, You) × 4 tiers each.
- **4 global tier thresholds** — the overall ScaleUp Score tiers.

Step-by-step:

1. Get written confirmation from Jeff for all 24 thresholds (20 per-domain + 4 global), with label and respondent message for each tier. Save the confirmation.
2. Navigate to `/admin/assessments/templates`. Open "Scaling Up Full Assessment".
3. Confirm the version row shows DRAFT v1.
4. Click **Edit** on v1. You will land on `/admin/assessments/templates/<su-full-id>/versions/<v1-id>/edit`.
5. In the editor, confirm you can see:
   - The read-only panel showing "Overall rollup: Mean of domain means" and "ScaleUp Score (0-100): enabled"
   - Five collapsible domain sections (People, Strategy, Execution, Cash, You) each with their own tier list
   - The global tiers list under scoring config
6. For each of the five domain sections:
   - Expand the section
   - Enter the four tier values (`minMetric`, `maxMetric`, `label`, `message`) from Jeff's sign-off
   - Confirm no gap or overlap between adjacent tiers
7. Enter the four global tier values into the global tiers list.
8. Click **Save**. Wait for the toast.
9. Navigate back to the template detail page.
10. Click **Publish** on the v1 DRAFT row.
11. If the publish modal opens with validation issues, follow section 5.
12. On success, the template is live. Coaches can immediately build campaigns against Scaling Up Full v1.

Guardrail reminder: if Jeff later wants to revise any threshold, follow section 3 (Duplicate to Edit to Publish). Do not attempt to "edit the live version" — you cannot, and you should not.

---

## 7. Re-running seed scripts

**Do NOT re-run** `npx tsx prisma/seed-scaling-up-full-assessment.ts` once you have edited the Scaling Up Full template via the admin editor.

Why: the seed script writes a known `contentHash` matching the seed's source content. Once you save edits via the admin UI, the database's `contentHash` reflects the edited content. Re-running the seed will detect the drift and throw a "State C" error to protect you from overwriting Jeff-confirmed values.

When the seed script is appropriate:

- **First-time setup only** — on a fresh database where the template doesn't yet exist.
- **Engineering-led restore** — if engineering needs to reset the template to its original seeded state. This requires explicit engineering involvement and Jeff's awareness.

If you see a "State C" error while running a seed script, stop. Do not delete the template, do not run any "force overwrite" flag, do not attempt to clear the contentHash manually. Send the error message to engineering and wait for guidance.

If you need to apply a new set of thresholds to Scaling Up Full, the correct path is always the admin UI (Duplicate to Edit to Publish), never the seed script.
