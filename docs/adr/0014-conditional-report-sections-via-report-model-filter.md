# Conditional report sections live in the answer-keyed report-model filter, not a survey-form conditional engine

- **Status:** Accepted (2026-06-23). Designed via brainstorm → `/grill-with-docs` → `/grill-me` →
  user-approved + preview-signed. Implementation gated on the per-wave TDD plan. Full spec:
  [docs/specs/v7.6/18i-wave-i-lva-conditional-obstacles-design.md](../specs/v7.6/18i-wave-i-lva-conditional-obstacles-design.md).
  Follow-on to [ADR-0010](0010-two-report-types.md) (report behaviour keyed by template alias).

## Context

The LVA assessment has a conditional shape Esperto renders natively: a respondent checks ≤3 "biggest
obstacle" factors (`S4_biggest_obstacles`, a MULTI_CHOICE), and the report explains **only those** via the
per-factor `S5_why_<factor>` follow-ups. It also shows a 16-factor strengths matrix (`S3_strengths`) at the
**group** level, not the individual level.

Our platform has **no survey-form conditional engine**. The seed
(`seed-lva-assessment.ts`) therefore ships all 16 `S5_why_<factor>` questions as **unconditional optional
TEXT** (the seed comment says so explicitly), and all 16 `S3_<factor>` sliders as required. Consequences:

1. The survey form shows all 16 follow-ups, so a respondent can explain a factor they never checked — and it
   renders in the report.
2. The required strengths sliders are always answered, so the answered-only report filter never trims the
   16-row matrix from the individual report.

Two structural options to make the report match Esperto:

- **(A) Build a survey-form conditional engine** — questions gain visibility predicates; the form hides
  `S5_why_<factor>` unless its S4 box is checked; the matrix is moved/flagged group-only. General and
  "proper," but a large client + data-model change touching every assessment, and it does nothing for the
  thousands of *already-submitted* LVA reports (their answers are already stored).
- **(B) Filter at the report-model layer** — keep the seed as-is; in `buildQualitativeModel`, suppress
  configured sections and render a follow-up only when its factor was selected in the gate MULTI_CHOICE,
  deriving the gated key-set from the pinned version's own gate options (fail-open when absent).

This is a real fork worth recording: a future engineer seeing 16 `S5_why_` questions in the seed, all shown
by the survey form, will reasonably wonder *"why isn't there a conditional engine?"* — and might build one,
or "restore" the matrix to the individual report. The answer is deliberate and non-obvious.

## Decision

**Conditional report behaviour lives in the report-model layer, keyed off the respondent's stored answers —
not in a survey-form conditional engine.**

1. A per-alias **`REPORT_FILTERS`** map in `qualitative-report-model.ts` (mirroring `SECTION_PRESENTATION`)
   declares, per template: `suppressSections` (omit entirely) and `conditionalFollowups`
   (`{ gateKey, followupPrefix }`).
2. `buildQualitativeModel` applies it generically: suppressed sections are skipped (their questions stay
   `assignedKeys`, so they never leak into the orphan bucket); once a **valid MULTI_CHOICE** gate question
   exists in the pinned version, **every** `followupPrefix`-matching item is conditional and renders iff its
   factor is in the gate answer — enforced by a **shared predicate applied in both the section loop and the
   orphan bucket**. It **fails open** (today's answered-only behaviour) when the gate question is absent or not
   MULTI_CHOICE, and treats a valid gate with a missing/non-array answer as "nothing checked" (all follow-ups
   hidden). *(Hardened from an initial "derive-from-options" sketch during the claudex adversarial review, which
   would have leaked a follow-up whose factor drifted out of the option list.)*
3. The survey form is **unchanged** — all questions still appear and all answers are still **stored**. The
   filter is render-only; no data is destroyed. A future form-level conditional (deferred) could later hide
   the boxes, and the stored data would still be available.
4. Report behaviour is **global/retroactive** (consistent with ADR-0010): existing LVA reports re-render under
   the filter on deploy.

## Consequences

- **Positive:** ships Esperto-fidelity LVA reports (no 16-row matrix in the individual view; explanations only
  for checked factors) with one file + tests, no migration/seed/flag, retroactive across existing data, and
  revert-safe. The group report (its own model) is untouched. The mechanism is generic and reusable for any
  future conditional template via a config entry.
- **Traceability:** since the change alters rendered bodies code-only (same `versionId`/`contentHash`), a
  `REPORT_FILTER_VERSION` + suppressed/hidden counts are recorded in the `VIEW_REPORT` audit, report metrics,
  and the email outbox log; and a read-only pre-merge audit quantifies the retroactive hide-rate for explicit
  approval before deploy.
- **Negative / watch:** an explanation a respondent typed for an **unchecked** factor is **hidden** from the
  report (still stored). This is intended (the S4 checkboxes are the source of truth), but it means the survey
  form and the report disagree about what's "in" until a form-level conditional is built. Tracked as a deferred
  follow-on. Also: `REPORT_FILTERS` is alias-keyed; a seed that renames a section/option key must update the
  entry (guarded by `lva-content.test.ts` on the seed side and the new model tests on the render side).
- **Alternatives rejected:** (a) a survey-form conditional engine — far larger, touches every assessment, and
  doesn't fix already-submitted reports; (b) re-seeding LVA to drop the matrix/follow-ups — destroys captured
  data and breaks version-pinning. The report-layer filter is reversible and data-preserving.
