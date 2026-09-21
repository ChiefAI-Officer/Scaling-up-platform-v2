# ADR-0039 — Member report entitlement is derived per request

**Status:** Accepted (2026-09-21)

## Context

A Member session spans several report routes, while Coaches may change a person's
Level, team, roster membership, or organization during that session. Persisting a
scope in the cookie or trusting a caller-supplied list would turn a former grant
into continuing access. The group reports are especially sensitive because they
name respondents, include answers and free text, and have no small-cohort
suppression.

## Decision

Every report loader resolves the current Member identity and derives Entitlement
inside the same database transaction that loads the requested report. The session
contains only the normalized address and issue time. Callers may provide a report
identifier, never a precomputed scope.

The durable rules are:

- everyone is entitled to their own reports;
- the three canonical CEO/founder Levels are entitled to all live Respondents in
  the same organization;
- `teamleader` is entitled to their own team and descendant teams, excluding every
  CEO-family Respondent;
- missing, unknown, and unmapped Levels—and a team leader without a team—fail
  closed to own-only;
- the scopes from every row in the Member identity are unioned;
- a group report is allowed only when that Entitlement covers every completed
  Respondent represented in it.

Release 1 activated only the own-report subset. Release 2 now applies the full
hierarchy on every personal- and group-report request, still behind the global
Member portal gate. Group cards and routes additionally retain the existing
per-instrument group-report gate and publish guard.

## Consequences

- Changes to roster, Level, team, organization, or campaign deletion take effect
  on the next render rather than at session expiry.
- Unknown production values deny breadth instead of silently granting it; the
  alias map starts empty.
- A department head cannot reach a report containing a CEO merely because the CEO
  sits in the same or a descendant team.
- Each protected render pays for fresh identity and authorization reads; this is
  accepted in exchange for avoiding stale cross-person access.
- Browser storage must never contain report bodies or Entitlement state.
