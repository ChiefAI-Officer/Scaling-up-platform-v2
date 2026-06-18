# The campaign group report: aggregation, cohort, and access model

- **Status:** Accepted (2026-06-18). Hardened through `/claudex:plan` (3 rounds: senior-eng →
  security → ops/SRE); this file reflects the post-review model (supersedes the pre-review
  "CEO-included for both / all-completed / canManageCampaign-read" wording).
- **Scope (build-time refinement, 2026-06-18):** Jeff confirmed the group report is surfaced for
  the **Leadership Vision Alignment template ONLY** (not the scored reports). The qualitative +
  scored aggregation models in this ADR are both built, but only LVA is reachable: a
  `GROUP_REPORT_ALIASES` allowlist (LVA) gates both the loader and the entry point. The scored
  model is dormant infrastructure, surfaced later by adding an alias.
- **Context:** Spec 17 Wave F #22 (CEO / Group report). Supersedes the deferrals in
  [ADR-0003](0003-*) (LVA group factor-bar) and [ADR-0007](0007-*) ("individual ≠ cohort report").
  Reuses the report-type dispatch from [ADR-0010](0010-assessment-reports-have-two-types-scored-and-qualitative.md).
  Full design + claudex Changelogs: [17f](../specs/v7.6/17f-wave-f-group-report-design.md).

## Context

Jeff asked (#22) for Esperto's team-level "CEO Full Report": *"CEO Report results compared with the
averages of the individual leader reports."* We must decide, in ways costly to change once reports
circulate as screenshots/PDFs: (1) which cohort a report covers and how the CEO is identified;
(2) how the aggregate is computed; (3) named or anonymized; (4) who may view a **bulk named-PII**
artifact; (5) how it's released and rolled back.

We already have, per campaign: a roster (`AssessmentCampaignParticipant`), one designated CEO
(`isCEO` partial-unique index + `/api/assessment-campaigns/[id]/ceo`), one pinned template
`versionId` (all submissions share a version), and a frozen `ScoreResult` per submission.

## Decision

1. **Auto-aggregate the whole campaign** (no composition picker, no persisted report object). The
   roster + the single `isCEO` designation already encode Esperto's Composition step (the `isCEO`
   partial-unique constraint *is* CEO min:1/max:1). Computed on demand; never stored.

2. **Two columns, two definitions — the CEO is *excluded* from the scored team comparison.**
   - *Qualitative* **`Mean`** = mean over respondents **who answered that question** (CEO included),
     honestly labeled "Mean" — verifiably Esperto's behavior (LVA *Net profit %* Mean 13 =
     (18+10+10)/3). A blank is never averaged as 0; each aggregate renders its `n` (answerer count).
   - *Scored* **`Team avg` / `Dev`** = mean over **NON-CEO** submissions; `Dev = CEO − teamExclMean`.
     **N<2 fallback:** with <1 non-CEO submission, `Dev` is suppressed ("—"). A "Dev from team" must
     compare the CEO to the *rest*, not to a group containing himself.
   - The scored aggregate **mirrors the per-respondent scored headline**: it aggregates whatever the
     frozen `result` carries — `perDomain` / `scaleUpScore` / `tier` where present, falling back to
     `perSection` rows otherwise — not a section table only.

3. **Fully named/attributed** (names + job titles, CEO marked). No anonymized variant in v1.

4. **Graceful degrade, never block.** Render the team aggregate from whatever's completed (N≥1);
   the CEO column/tag appears only when the designated CEO has a completed submission.

5. **Gated to `accessMode === INVITED`.** PUBLIC campaigns have no roster/`isCEO`; population
   aggregates for PUBLIC are the existing admin `aggregate-report.ts`'s concern.

6. **Cohort = all completed submissions (submission-based, orphan-robust).** Aggregate every
   completed submission; resolve names via the surviving `OrgRespondent`; read `isCEO` from the
   participant row if present. The loader **detects and still includes** orphaned submitted
   respondents (submission with no current participant row — reachable because the participant-delete
   route's submission-check is a non-transactional pre-check and the invitation FK is
   `ON DELETE SET NULL`), so no completed response is silently dropped. The delete-route race is
   flagged as a recommended adjacent hardening (lock the re-check in a tx, or revoke instead of
   hard-delete).

7. **`canViewGroupReport` — stricter than the per-respondent read gate.** Because this is a bulk
   named-PII disclosure, non-privileged coaches must be **currently active + currently own the org +
   currently have template access** (not the lenient retained-`"read"` gate); admin/staff bypass,
   audited.

8. **Data-source split.** Qualitative aggregates **raw `answers`** (validated/normalized against
   `questionsByKey` on read — finite numbers, type match, known option keys, deduped stableKeys,
   invalid skipped with a degraded notice); scored reads **frozen `result.perSection`/`perDomain`/
   `perQuestion`** (never recomputed). Inputs loaded in a **single consistent snapshot** (one joined
   read or a `RepeatableRead` tx) so counts/CEO-marker/rows/provenance share one instant.

9. **Default-off `WAVE_F_GROUP_REPORT_ENABLED` flag + canary + kill-switch.** Gates BOTH the
   CampaignDetail entry point AND the route (fail-closed when off); admin/org/coach allowlist canary;
   launch = flip on (Wave B/D pattern). A new bulk-PII surface warrants an instant kill-switch (no
   redeploy), unlike Wave C/E pure-rendering changes.

10. **`GROUP_REPORT_VIEW` audit written directly + fail-closed** (not the fail-open `logAudit`),
    capturing actor + IP/UA + generatedAt + versionId + contentHash + ceoParticipantId +
    invited/completed counts + rendered submission IDs. Plus a visible **"as of … · N of M
    completed · version …" provenance** line on the report.

11. **Peers/benchmark column deferred to #32** (no cross-org benchmark corpus exists).

## Consequences

- **Positive:** zero new schema; reuses `isCEO`, `aggregate-report.ts`, `buildQuestionMetaByKey`,
  the Wave-E qualitative model + `SECTION_PRESENTATION`, and the report-type dispatch. The scored
  `Dev` is a *true* CEO-vs-rest alignment signal. A kill-switch bounds blast radius for a bulk-PII
  route. Submission-based + orphan-robust never drops a real response.
- **Negative / accepted trade-offs:**
  - Two different aggregate definitions (qualitative Mean incl. CEO; scored Team-avg excl. CEO) — a
    deliberate split, documented per column, because they are different, honestly-labeled things.
  - On-demand reports can change as late submissions arrive; mitigated by the visible "as of"
    provenance + audit. A persisted snapshot / freeze-on-close is a noted follow-up, not v1.
  - Named side-by-side comparison is politically sensitive; accepted — it is the point of a
    vision-alignment instrument and matches Esperto.

## Alternatives considered

- **Team avg *including* the CEO for the scored matrix** (the pre-review decision) — rejected:
  self-dilutes the "Dev from team" gap and reads as zero when only the CEO has submitted. Qualitative
  `Mean` keeps the CEO only because it is labeled "Mean", not a deviation.
- **Current-roster cohort** — rejected (R2): can silently drop an orphaned completed submission;
  submission-based + orphan-robust is correct.
- **Reusing `canManageCampaign("read")`** — rejected (R2): too lenient for a bulk-PII disclosure.
- **No feature flag (merge = launch)** — rejected (R3): a new bulk-PII route needs an instant
  kill-switch.
- **Esperto-faithful composition picker + persisted Summary Report object** — rejected for v1: the
  campaign + `isCEO` already encode composition with zero new UI/state.
- **Anonymized aggregate** — a real future feature; out of scope for v1.
