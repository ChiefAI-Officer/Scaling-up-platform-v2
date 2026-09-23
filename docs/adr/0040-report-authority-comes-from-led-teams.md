# ADR-0040 — Report authority comes from led teams, not from team membership

**Status:** Accepted and **active** (2026-09-23). Shipped as R1 (PR #459, `e86edd49`) and R2
(PR #460, `14eee747`); activated by `WAVE_MP_LED_TEAMS_ENABLED=1` with rebuild
`dpl_D14ekzsS8FHoyshmuyB19wFuZS7M`. Entitlement now reads led-team roots. `WAVE_MP_LED_TEAMS_KILL`
is absent and reverts to the legacy `teamId` roots if introduced.
Coach UI, CSV contract and Esperto mapping remain R3–R5.
**Amends:** [ADR-0039](0039-member-report-entitlement-is-derived-per-request.md) (its `teamleader`
rule only; the per-request derivation principle is unchanged).
**Spec:** [`../superpowers/specs/2026-09-23-member-led-teams-design.md`](../superpowers/specs/2026-09-23-member-led-teams-design.md)
**Decision record:** `/tmp/MEMBER-HIERARCHY-STAGE2-DECISIONS-2026-09-23.md`, Decisions 1–9.

## Context

ADR-0039 derives a `teamleader`'s scope from `OrgRespondent.teamId` — the team the person is
**in**. The design spec (§6.3) already recorded the hazard: `teamId` records membership, not
leadership, and the two diverge the moment a coach models a leadership team as its own node.
The CEO-family subtraction was added to stop a leader reaching *upward* to a CEO.

The 2026-09-23 fixture walkthrough proved the residual case the guard does not cover. A
`teamleader` attached to a **company**-type node reached six of eight reports in the
organization, including both department heads — CEO scope minus the CEOs, granted by a non-CEO
level. The coach authoring UI actively invites this: `Add Team / Company` offers four node types
(`company`, `department`, `team`, `folder`) with no guidance, and `OrgTeam.type` is a free-form
nullable string that the entitlement walk never reads.

Esperto's own configuration, read read-only on 2026-09-23, declares `folder` as *"just a folder
to store companies, departments or teams in"* — a container that is not an organizational unit,
yet is walked as one today.

## Decision

**Team membership and reporting authority become two separate facts.**

- `OrgRespondent.teamId` continues to record where a member **belongs**. It still determines who
  falls *into* someone else's scope, and it still drives display and campaign composition.
- A new zero-to-many relation records the teams a membership **leads**. Only that relation grants
  delegated report visibility.
- A `teamleader` with no led teams fails closed to own-reports-only. This is a normal state, not
  an error.
- Every led team must belong to the same organization as the membership. Authority never crosses
  organizations; a member holding several organization memberships has each one computed
  independently and the results unioned.
- CEO-family levels keep organization-wide scope and take no led teams; led teams on a CEO-family
  or `employee`/`guest` level are rejected, not ignored.
- The CEO-family subtraction is retained unchanged.

Belonging to a company-level leadership team therefore becomes legitimate and inert: it says
where you sit, and grants nothing on its own.

## Consequences

- The Finding B escalation closes by construction rather than by constraining node types. No
  meaning is attached to `OrgTeam.type`, which stays descriptive.
- Existing `teamleader` rows are backfilled with their current `teamId` as their sole led team,
  so behaviour is identical at cutover and the feature flag is a behavioural no-op in both
  directions until a coach edits led teams. Divergence begins only on deliberate authoring.
- The backfill encodes one last "membership meant leadership" inference. It is audited per row
  and surfaced to coaches for confirmation, so the guess is visible rather than silent.
- The generic member CSV gains a required `level` column and an optional `leads` column; imports
  validate atomically so a plausible-looking hierarchy can no longer arrive with no authority in
  it.
- A coach must now say who leads what. That is new work at authoring time, and it is the point:
  the previous model inferred it and the inference was wrong.

## Alternatives rejected

- **Constrain which node types may hold a `teamleader`.** Attaches authorization meaning to a
  descriptive, unvalidated, free-form field, and still cannot express "leads two departments".
- **Warn the coach at assignment time and change nothing else.** Cheapest, consistent with the
  two existing inline warnings, but leaves an escalation reachable by ignoring a warning.
- **Keep `teamId` and add a boolean "is leader of this team".** Cannot express zero-to-many, which
  Decision 1 requires.
