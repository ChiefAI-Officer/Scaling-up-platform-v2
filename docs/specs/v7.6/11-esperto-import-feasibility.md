# 11 — Esperto historical-data import: feasibility memo (GATED)

> **Status:** 🔴 **Feasibility gate — DO NOT BUILD.** This memo scopes the question and lists what we need from Jeff. The verdict (feasible / which path / not worth it) is written **only after Jeff sends sample Esperto JSON files.**
> **Scope:** Importing ~1-year-old Esperto historical assessment responses into the new platform. No code, no schema, no migration until the sample is inspected and a path is approved.
> **Related:** [CONTEXT.md](../../../CONTEXT.md) (entities), [09 content-reseed](./09-assessment-content-reseed.md) (the reseeded questions this import would attach to).

## 1. The ask (June 2 Jeff call)

Scaling Up has a **full Esperto JSON export of all coaches' data from ~1 year ago**. Originally considered useless (data-only, no context); now that we've reseeded the real questions, Jeff wants to know: **can that historical data be imported** so coaches see past results in the new platform? Envisioned UX: an **"Import" button that accepts a JSON file drop, per assessment.**

**What we know about the export (unverified — needs the sample):**
- Esperto can export assessment **response data** as JSON.
- The files reportedly contain **only response values** — **no question text, no user identifiers, no company information.**
- User/company data **cannot** be exported from Esperto at all.
- Jeff will send sample files (and recreate a fresh sample Esperto report → fresh export) for analysis.

## 2. What an import must produce (the target, already mapped)

To show a historical result, the platform needs an `AssessmentSubmission`, which sits at the bottom of a **required entity chain** (all non-null unless noted):

```
Coach ──owns──▶ Organization (name, ownerCoachId)
                     │
                     ▼
              OrgRespondent (email, firstName, lastName, dedupeSource, dedupeValue)
                     │
                     ▼
        AssessmentCampaign (templateId, versionId, organizationId, alias, name, openAt, endMode, createdBy)
                     │
                     ▼
        AssessmentInvitation ──▶ AssessmentSubmission (campaignId, submittedAt, answers Json, result Json)
```

- `AssessmentSubmission.answers` = `[{ stableKey, value }]`, where `value` is `number` (SLIDER/NUMBER), `string` (TEXT), or `string[]` (MULTI_CHOICE). Each `stableKey` must match a question in the **published** template version the campaign pins.
- `AssessmentSubmission.result` is **NOT NULL** — must store Esperto's score verbatim **or** be recomputed via `scoreSubmission`.
- `respondentId` and `invitationId` are **nullable** (this is the public-submission path — the escape hatch if we have no identity).
- A campaign pins a `versionId` whose `contentHash` = sha256 of `{questions, sections, scoringConfig, reportConfig, invitationSubject, invitationBodyMarkdown}`. Attaching historical answers requires the published version's `stableKey`s to match the export's keys.

## 3. Hard blockers (what the export is missing vs. the target)

1. **No company/coach identity** → cannot build `Organization` (needs `name` + a real `ownerCoachId`).
2. **No respondent identity** → cannot build `OrgRespondent` (needs `email`, names, dedupe key).
3. **No campaign linkage** → nothing ties a record to a template, version, org, or coach.
4. **stableKey crosswalk does not exist.** Each template uses a different key scheme (Rockefeller `Q1_1`, QSP semantic, SU Full `Q01` zero-padded + section domains, LVA semantic). Esperto's keys (if any) almost certainly differ — a crosswalk must be **authored by hand, per template**, and is only possible if the export carries per-question values.
5. **Unknown value encoding** — we don't know Esperto's scale/format (0–3? 0–10? raw label?) so we can't map to our `value`.
6. **`result` provenance** — must store Esperto's score verbatim, because recomputing SU Full's ScaleUp Score isn't possible (its weighting formula is owned by Esperto, not in our export — see CONTEXT.md "ScaleUp Score").
7. **Published-version dependency** — SU Full's current version is **PROVISIONAL and unpublished** (must stay unpublished per standing constraints); SU Full historical data can't attach until a published version exists.

## 4. The three honest outcomes (which one depends on the sample)

- **Path A — Full org-graph import.** Possible **only if** the export carries identity (company name + respondent emails/names) **and** per-question structure. Then: reconstruct orgs/respondents/campaigns/submissions and map answers via a per-template crosswalk. *Least likely, given "no user/company info."*
- **Path B — Anonymous PUBLIC submissions (most likely if any import is viable).** If there's **no identity** but the records **are attributable to a template** (and ideally carry per-question values): import as anonymous `AssessmentSubmission`s (`respondentId`/`invitationId` null) under a synthetic per-template "Historical Import" campaign, with Esperto scores stored **verbatim** in `result`. Coaches see aggregate historical results, not per-person.
- **Path C — Not feasible / not worth it.** If the data is opaque aggregate numbers with no reliable template attribution and no per-question structure, there's no honest mapping — recommend **not** importing (or importing only a headline score as a non-interactive archived record).

## 5. Six questions for Jeff (answer before any design)

1. **Template attribution** — does each record say which assessment it belongs to (Rockefeller / QSP / LVA / SU Full)? How (a name, an ID, a filename)?
2. **Per-question structure** — are individual question answers present, or only section/overall scores?
3. **Value encoding** — what scale and format are the answers (0–3, 0–10, percentage, raw text)?
4. **Any identity at all** — even partial: company name, respondent email/name, a coach label?
5. **Timestamps** — is there a submission date per record (so historical results sit correctly in time)?
6. **Volume / cardinality** — roughly how many records, how many companies, how many distinct assessments?

## 6. What happens when the sample arrives (still no build)

1. Inspect 1–2 sample files; classify against §4 (A / B / C).
2. If per-question structure exists, **attempt a stableKey crosswalk for one template** as a proof point (paper exercise — no import code).
3. Write the **verdict**: feasible? which path? what exactly is missing (the specific blocker that gates it)?
4. Only on Jeff's go-ahead → a separate **spec → plan → build** for the "Import per assessment" UX (TDD, staging-first, attach only to **published** versions, never mutate published content or live emails).

## 7. Standing constraints carried into any eventual build

- Staging-first; nothing reaches respondents without an explicit admin Publish.
- Published template versions and live invitation emails are **never** mutated.
- SU Full's PROVISIONAL version must **not** be published as a side effect.
- TDD: failing test before implementation.
