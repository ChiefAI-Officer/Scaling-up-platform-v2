# Wave N — Per-Respondent Longitudinal Comparison (punch-list #23)

**Status:** Design — grilled (`/grill-with-docs`, Q1–Q7 + defaults), awaiting user review → `/frontend-design` → implementation plan.
**Date:** 2026-06-30
**Source item:** Jeff June-9 punch-list **#23** — *"Is comparison reporting built in? … If this is not built, it needs to be on the roadmap."*
**Decisions of record:** **ADR-0016** (scored-only + same-version deltas); CONTEXT.md terms *Per-respondent longitudinal comparison* + *Cohort trend*. Reuses ADR-0001 (stableKey continuity), ADR-0010 (scored vs qualitative report type).

---

## 1. Summary

Track **one person**'s results across the campaigns they completed for the same scored assessment —
overall score trend, per-section deltas, and tier movement over time. It is the single-person counterpart
to the already-shipped **Cohort trend** (`/portal/assessments/trends`), which aggregates a whole
organization.

Additive, read-only, behind a default-OFF flag `WAVE_N_RESPONDENT_LONGITUDINAL_ENABLED`. **No migration** —
it reads existing `AssessmentSubmission.result` (frozen) and `OrgRespondent`.

## 2. Decisions of record (from the grill)

| # | Decision |
|---|----------|
| Q5 | **Scored templates only** (Rockefeller, Five Dysfunctions, Scaling Up Full, Scaling Up Quick). Qualitative templates (LVA, QSP v1/v2) have a near-empty frozen `result` (only SLIDER_LIKERT is scored) → nothing to trend → entry hidden + `notApplicable: "qualitative-template"`. Qualitative answer-level comparison deferred. **(ADR-0016)** |
| Q6 | **Show all submissions chronologically; compute deltas only between submissions sharing the same `versionId`.** Cross-version values are shown with a "different version" badge and no delta, plus a header note. **(ADR-0016)** |
| Q7 | **Authorize on `canAccessOrganization(actor, organizationId)`, 404 on fail** — byte-for-byte the cohort-trends model (it's the same data disaggregated). Org ownership is singular, so this scopes correctly without per-campaign filtering. **Supersedes** the "filter to manageable campaigns" idea from the original design (that assumed per-campaign ownership; ownership is per-org). No stricter currency gate (that's for *bulk* PII; this is one person's own history). |
| Q4 | **Default-OFF flag** `WAVE_N_RESPONDENT_LONGITUDINAL_ENABLED` gates the loader/route + entry links. |
| — | **Comparison depth** = overall + per-section + tier (chosen in scope question); **no per-question** v1. |
| — | **Headline metric mirrors the per-respondent Results report** per template: per-section for Rockefeller/Five-D; per-domain **+ ScaleUp (provisional label, ADR-0015)** for SU-Full; overall/ScaleUp for Quick; a tier-movement row only where the template has a real tier. |
| — | **Entry link** shown only when the person has **≥2 comparable submissions** for that scored template. Reaching the view with 1 submission still renders it with a "need ≥2 to compare" note. |
| — | Reads the **frozen `ScoreResult` only** — never re-scores; degrades on a malformed result. |

## 3. Matching model — "the same person across campaigns"

The stable identity is **`OrgRespondent.id` within an org** — `OrgRespondent` is deduped per org by
`(organizationId, dedupeSource, dedupeValue)` (email's normalized form or the Esperto external id), so the
same person re-invited to a later campaign keeps the same `respondentId`. `AssessmentSubmission` links
`respondentId` + `campaignId` and is indexed `[respondentId, submittedAt]`.

A longitudinal view is therefore keyed by **(respondentId, templateId)**:

```
all AssessmentSubmission
  where respondent.organizationId = org
    and respondent.id            = respondentId
    and campaign.templateId      = templateId
    and submittedAt is not null
  order by submittedAt asc
```

- **Per-template** because you cannot compare an LVA score to a Rockefeller score — the comparison axis is
  one assessment over time.
- **Public takers** (`respondentId = null`) are excluded — they have no stable cross-campaign identity.

## 4. Loader

New `lib/assessments/respondent-longitudinal.ts`:

```ts
getRespondentLongitudinal(db, actor, organizationId, respondentId, templateId)
  : Promise<RespondentLongitudinalOutcome>
```

- **Authz first:** `canAccessOrganization(actor, organizationId)` → `forbidden` (route renders 404).
- **Scope gate:** `reportConfigFor(template.alias).reportType !== "scored"` →
  `notApplicable: "qualitative-template"`.
- Load the person's submissions (query above); join each `campaign` (name, `openAt`/`submittedAt`,
  `versionId`, version number).
- **Reuse the trends version-partition** to group by `versionId` and identify the comparable set(s).
- For each submission read the **frozen `ScoreResult`** and project the headline series:
  - overall: `overallAverage`, `scaleUpScore?`, `tier?`.
  - per-section: `perSection[].averagePoints` (or `perDomain` for SU-Full).
- Compute **deltas only between consecutive same-`versionId` submissions**; cross-version → no delta + badge.
- Return a discriminated outcome: `forbidden | notApplicable | empty | ok` (mirrors the report-gate
  outcome shape, ADR-0012 family) with `degraded` set when a result is malformed.

It never re-scores; it never aggregates across people (that's the Cohort trend).

## 5. Route & placement

Portal page (consistent with the Cohort trend, which lives in the portal):

```
/portal/assessments/respondents/[respondentId]/longitudinal?templateId=…&organizationId=…
```

Backed by `GET /api/.../respondent-longitudinal` (flag-gated; 401 unauth; 404 on
`canAccessOrganization=false`, anti-probing; `notApplicable` body for qualitative; `no-store`).

**Entry points** (both campaign-scoped surfaces the coach already manages):
1. From the per-respondent **Results report** — a "View across campaigns" link (shown only when ≥2
   comparable submissions exist), `prefetch={false}`.
2. From a campaign's **respondent list** — a per-row "history" affordance under the same ≥2 rule.

## 6. UI

- **Header:** person name · company · assessment name · "N assessments, `<first>`–`<last>`".
- **Overall trend:** a line/sparkline of the overall metric (overall avg / ScaleUp) across campaigns, x-axis
  = campaign dates.
- **Per-section table:** rows = sections (or SU-Full domains), columns = each campaign (dated), cells =
  section average **+ a delta arrow** vs the previous comparable column; a **tier-movement** row where the
  template has a real tier (Low→Med→High).
- **Version note:** "Some assessments used an earlier version; deltas shown only between comparable versions"
  — with per-column "different version" badges where applicable.
- **States:** 1 submission → render it + "need ≥2 to compare"; malformed result → degrade gracefully
  (skip the bad column, note it); flag-off / qualitative / no submissions → not-applicable / empty.

## 7. Security & privacy

- **Authz:** `canAccessOrganization` (admins bypass); 404 on fail (no org-id enumeration).
- **Read-only**, frozen-result only; no mutation, no re-score.
- **Audit + rate-limit:** reuse the report-access-gate posture (fail-closed audit `RESPONDENT_LONGITUDINAL_VIEW`
  with actor/IP-UA/respondent/template + counts; per-actor+respondent+IP rate-limit before the load; `no-store`
  via middleware). This keeps the new PII surface inside the same protocol as the per-respondent report and
  group report.

## 8. Testing (TDD targets)

- Matching: only this respondent's submissions, this template, org-scoped, ordered by `submittedAt`; public
  (null respondent) excluded.
- Scope gate: qualitative alias → `notApplicable: "qualitative-template"` (no load, no audit body leak).
- Deltas: same-`versionId` pairs deltaed; cross-version shown without delta + badged; version-partition reuse
  matches trends.
- Headline mirror: SU-Full → domains + ScaleUp (provisional label); Rockefeller/Five-D → sections; tier row
  present only where tier exists.
- Authz: `canAccessOrganization=false` → 404; admin → ok; unauth → 401.
- Entry link visibility: <2 comparable submissions → no link; ≥2 → link.
- Degraded: malformed `result` column skipped + noted; 1-submission renders with the compare note.
- Flag-off: route 404s + entry links hidden.

## 9. Files to touch

- `src/src/lib/assessments/respondent-longitudinal.ts` (new) — loader + delta/version logic (reuses
  `trends.ts` partition helpers).
- `src/src/lib/assessments/trends.ts` — extract/share the version-partition + campaign-ordering helpers (no
  behavior change to the cohort trend).
- `src/src/lib/assessments/access-control.ts` — (re)use `canAccessOrganization`; thin
  `canViewRespondentLongitudinal` wrapper only if a scope-specific name aids clarity (else reuse directly).
- `src/src/app/(portal)/portal/assessments/respondents/[respondentId]/longitudinal/page.tsx` (new) + the API
  route.
- A `RespondentLongitudinalView` component + scoped CSS.
- Entry links: per-respondent report page + CampaignDetail respondent list (`prefetch={false}`, ≥2 rule).
- `wave-n-flags.ts` (new) — `WAVE_N_RESPONDENT_LONGITUDINAL_ENABLED`.
- `RESPONDENT_LONGITUDINAL_VIEW` added to the `AuditAction` union (free-form string, no migration).
- Tests across the above.

## 10. Launch

Merge dark (flag default-OFF). Launch = set `WAVE_N_RESPONDENT_LONGITUDINAL_ENABLED=1` on Vercel Production +
redeploy after a prod smoke (a respondent with ≥2 scored campaigns shows deltas; qualitative → not-applicable;
flag-off → 404). Kill = zero the flag + redeploy. Short `18n-ops-runbook.md` ships with the implementation.

## 11. Explicitly out of scope (v1)

- **Qualitative answer-level comparison** (a person's raw free-text/choices across time) — a different,
  deferred feature (ADR-0016).
- **Per-question** deltas (depth chosen = overall + section + tier).
- **Cross-org** comparison (a person who exists in two orgs is two `OrgRespondent` rows by design).
- Cross-version delta normalization (would need a scoring-config-equality check; the same-version rule is the
  safe v1).
