# Member led teams — design

**Status:** R1 and R2 implemented, deployed and **activated** 2026-09-23 (PRs #459 / #460).
`WAVE_MP_LED_TEAMS_ENABLED=1` in Production since deployment `dpl_D14ekzsS8FHoyshmuyB19wFuZS7M`;
`WAVE_MP_LED_TEAMS_KILL` absent and available for containment.
R3 (coach UI), R4 (CSV contract) and R5 (Esperto mapping) are **not** implemented and are not
authorized by this document.

> ⚠️ **Activation does not by itself close the escalation this spec exists to fix.** Decision 10's
> backfill preserves each leader's prior authority, so flag-on and flag-off are identical until a
> coach edits led teams. Verified in Production 2026-09-23: 6 backfilled edges, 0 integrity
> violations, 0 old/new scope mismatches across 31 live memberships — and 4 of those 6 edges still
> grant peer visibility that Decision 11 rules out. The correction lands in R3 (§9).
**Date:** 2026-09-23 · **ADR:** [`../../adr/0040-report-authority-comes-from-led-teams.md`](../../adr/0040-report-authority-comes-from-led-teams.md)
**Implements:** Decisions 1–9, `/tmp/MEMBER-HIERARCHY-STAGE2-DECISIONS-2026-09-23.md`, plus
Decision 10 and the Decision 2 amendment recorded in §2.
**Evidence:** `/tmp/MEMBER-HIERARCHY-FIXTURE-WALKTHROUGH-EVIDENCE-2026-09-23.md` (fixture walk) ·
`/tmp/ESPERTO-MEMBER-LEVEL-EXPORT-EVIDENCE-2026-09-23.md` (Esperto source data)
**Amends:** design spec `2026-09-17-member-portal-v1-design.md` §6.3 and ADR-0039's `teamleader` rule.

---

## 1. Outcome

A coach states, per member, **which teams that person leads** — zero, one, or several. Report
visibility follows that statement and nothing else. Being *in* a team, at any level of the tree,
grants nobody visibility over anybody.

## 2. Decisions carried in, and two amendments

Decisions 1–9 are recorded in the decision log and are not restated here. Two additions:

**Decision 10 — existing team leaders are backfilled (operator-approved 2026-09-23).**
Every live `teamleader` holding a non-null `teamId` is given that team as its sole led team.
Behaviour is unchanged at cutover. The alternative — fail closed and require re-authoring — was
rejected because on a real customer it is silent access loss. The backfill is audited per row and
flagged for coach confirmation, so the inference is visible.

**Decision 2 — outcome kept, reasoning corrected (operator-approved 2026-09-23).**
Decision 2 collapses coach-facing authoring to one `CEO/Founder` level. Its stated premise — that
the variants have *"identical behavior and no defined distinction"* — is **wrong** and must not be
repeated. Esperto's `settings/config → data.memberlevels` defines a real distinction: each level
carries a `variants` map of instrument → report-type flags, so `ceofounder` alone gets
`selfcompare` on ScaleUp2 and `admin` on 5SOTSv2, while `ceofounderwithteam` alone gets `group` on
RockHabits. The correct reason to collapse them is that **the distinction is per-instrument
report-type access, an axis this product does not implement at all** — not that no distinction
exists. All three remain CEO-family for entitlement; the two variant slugs stay valid stored
values and stay importable.

## 3. The model

Two facts, previously one:

| Fact | Field | Answers | Grants |
|---|---|---|---|
| Membership | `OrgRespondent.teamId` (unchanged) | where does this person sit? | nothing |
| Authority | **new** led-teams relation | whose reports may this person open? | delegated scope |

Membership still decides who falls *into* a scope. Authority decides who *has* one. The descendant
walk continues to match candidates by their `teamId`; only the walk's starting points change.

## 4. Domain addition

A join relation between a roster row and the teams it leads. Shape, not final Prisma:

```
OrgRespondentLedTeam
  respondentId    FK OrgRespondent
  teamId          FK OrgTeam
  organizationId  denormalized, must equal both parents' organizationId
  createdAt, createdBy, source ("coach" | "csv" | "esperto" | "backfill-0040")
  @@unique([respondentId, teamId])
  @@index([teamId])
```

`organizationId` is denormalized because no single foreign key can express "the led team and the
member belong to the same organization". The writer validates it; a test enumerates every row
where the three organization ids disagree and fails on any. `source` exists so a backfilled
inference is distinguishable from a coach's statement — §7 depends on it.

Additive migration. No column is dropped and `teamId` is not touched.

## 5. Entitlement

Today, `src/src/lib/members/entitlement.ts`:

```
if level == "teamleader" and row.teamId != null:
    teamIds = descendantTeamIds(row.teamId, teams)
```

Becomes:

```
if level == "teamleader":
    roots   = ledTeamIds(membership)          # zero-to-many, same organization
    teamIds = ⋃ descendantTeamIds(root, teams) for root in roots
    return own ∪ { r : r.teamId ∈ teamIds ∧ ¬isCEOFamily(r.level) }
```

Unchanged and load-bearing: CEO-family keeps organization-wide scope; the CEO-family subtraction
stays; `employee`, `guest`, unset and unrecognised levels stay own-only; per-membership scopes are
unioned across organizations; nothing walks to a parent team; entitlement is still derived inside
the request transaction per ADR-0039.

**Led teams on a level that cannot hold them are a validation error, never silently ignored**
(Decision 6). Ignoring them would let a coach believe access was granted.

## 6. What this does NOT change

Stated because the blast radius looks larger than it is: the member session, sign-in, the report
renderers, group-report composition, `AssessmentCampaignParticipant.isCEO`, campaign authorship,
coach and admin authorization, and every non-member surface. `OrgTeam.type` gains no meaning and
stays descriptive.

## 7. Migration and the cutover property

1. Additive migration creates the relation.
2. Backfill inserts one row per live `teamleader` with a non-null `teamId`, `source =
   "backfill-0040"`, with an `AuditLog` row each naming respondent, team and reason.
3. Measured on 2026-09-23: **6 rows** qualify (11 live `teamleader` rows, 6 with a team). All are
   fixtures. Re-measure immediately before running — do not trust this number later.

**The safety property worth stating explicitly:** after the backfill, flag-on and flag-off compute
*identical* scopes for every existing member, because each leader's only led team is the team the
old rule read. The flag is therefore a behavioural no-op in both directions at cutover, and stays
one until a coach deliberately edits led teams. A rollback loses authored led-team data but
restores prior behaviour exactly.

A verification query must confirm, before the flag is flipped, that the two algorithms agree for
every live member. Disagreement means the backfill is incomplete.

## 8. Flag

`WAVE_MP_LED_TEAMS_ENABLED` with `WAVE_MP_LED_TEAMS_KILL` winning, matching the repository
pattern. Flag-off reads `teamId` exactly as today. The coach-facing led-teams control and the CSV
`leads` column are hidden when off.

## 9. Coach surfaces

- **Add / Edit Member** gain a multi-select **Leads** control, populated with teams from that
  member's organization only, enabled only for `Leadership team member`.
- The existing *"level without a team"* inline warning **changes meaning**: it must now fire on
  *no led teams*, and say that the member will see only their own reports. Its current wording
  keys on `teamId` and would become wrong rather than merely stale.
- A backfilled led team (`source = "backfill-0040"`) is shown as inferred, with a one-click
  confirm. This is how Decision 10's guess stops being silent.
- The *"level isn't recognised"* warning is unchanged.

## 10. Generic member CSV (Decisions 3–7, 9)

- `level` becomes **required**, from the canonical coach-facing vocabulary.
- New optional `leads` column: zero-to-many team paths separated by `|`, each path using `/`
  between levels, e.g. `Sales|Marketing/Enterprise`.
- Non-empty `leads` is legal only on `Leadership team member`.
- Every `leads` path must resolve to an existing team or to one declared by this CSV's `team`
  column. **`leads` never creates a team.**
- Validation is **atomic**: any missing, unrecognised or deprecated level, any incompatible
  level+`leads` pair, and any unresolvable path blocks the whole import before any write, listing
  every offending row.
- Pre-commit preview and completion summary both show counts per level plus
  `No level / unresolved`, which must be zero before commit is enabled.

This closes the failure the walkthrough found: a correct-looking org chart importing with no
authority in it.

## 11. Esperto import (Decision 8, plus a defect the export exposed)

Decision 8's visible, fail-closed mapping is unchanged: recognised source levels map visibly to
the canonical four, the staged preview shows source and mapped value, unknown/empty/deprecated
values block commit, the original value is retained as audit metadata, and no source value
silently becomes own-only.

**Two facts from the 2026-09-23 export change what gets built:**

1. 🔴 **`level` is nullable in the real export and our parser rejects null.**
   `EspertoMemberSchema` declares `level: z.string()`; the export emits `level: null` for **6 of 8
   rows** — every member with no level assigned. `z.string()` rejects null and the array schema is
   `.min(1)`, so a single unassigned member **fails the entire import**. The fixture
   (`fixtures/members.json`) contains only `ceofounderwithteam` and `teamleader`, never null,
   which is why it was never caught. Fix: `z.string().nullable()`, a null-level fixture row, and a
   null-safe `roster-plan.ts:113`. **This is a factual correction and is independently
   shippable ahead of everything else in this spec.**
2. **All six slugs are confirmed** against `settings/config → data.memberlevels`, matching
   `respondent-levels.ts` exactly. The "best-guess pending a real export" note is retired. But
   Esperto exposes Add/Edit/Delete Member Level, so levels are **admin-configurable per tenant,
   not a closed enum** — another tenant may emit slugs we have never seen. Mapping must therefore
   stay operator-corrected at import time; a hardcoded alias table would be wrong, and the empty
   alias map (spec §6.3.1) stays empty.

## 12. Failure behaviour

| Condition | Member sees | System does |
|---|---|---|
| `teamleader`, no led teams | own reports only | fails closed; coach-side warning |
| Led team in another organization | own reports only for that membership | rejected at write; test enumerates violations |
| Led team soft-deleted | that root contributes nothing | already handled — the walk filters `deletedAt` |
| Backfilled led team never confirmed | unchanged access | stays flagged as inferred |
| CSV with any invalid row | nothing imported | every offending row reported |

## 13. Test obligations

Written as obligations because the last three defects on this feature all passed a full green
suite.

- The §7 agreement check — both algorithms produce identical scopes for every live member after
  backfill — as an executable test, not a one-off query.
- The fixture organization becomes the regression fixture: **Jordan must collapse from six
  visible reports to own-only**, and Sam must still see exactly Sam, Jamie and Alex.
- Cross-organization led teams: a member leading a team in organization A gains nothing in B.
- Zero-to-many: a leader of two sibling departments sees the union, deduplicated, with no double
  counting.
- A led team on `CEO/Founder`, `Employee` or `Guest` is rejected.
- **At least one test must execute against a real database rather than a mocked `db`.** Both the
  `/member/reports` crash and the Esperto nullable-level defect are invisible to mocks, and both
  shipped green.

## 14. Non-goals

Parent-group visibility (Esperto has it; Jeff said nobody sees above them). A "team I lead"
concept for CEO-family levels. Per-instrument report-type permissions — the axis §2 identifies in
Esperto's variants and which this product does not implement. Any meaning for `OrgTeam.type`.
Cross-organization authority. Account linking across different email addresses.

## 15. Open question for Jeff

Every level in the inspected Esperto tenant grants only `reportsownviewonly`; neither
`reportsgroupownviewonly` nor `reportsparentgroupownviewonly` is granted to any level. In that
tenant **nobody, CEO included, sees another person's reports by level.** The hierarchy described
on the 2026-09-15 call is therefore a behaviour Jeff wants, not one he has been running. Worth
confirming before this ships, since it is the premise the whole feature rests on.
