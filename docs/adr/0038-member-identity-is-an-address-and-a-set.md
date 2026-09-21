# ADR-0038 — Member identity is an address and a set

**Status:** Accepted (2026-09-21)

## Context

The member portal has no new account record and no password. Its audience is the
people Coaches already place on organization rosters. One email address can occur
on several live `OrgRespondent` rows, including rows in different organizations
with different levels and teams. Choosing one row would make authorization depend
on database ordering and would hide legitimate memberships.

Public Campaign takers do not need a roster row, so an assessment submission alone
cannot establish membership. Soft-deleted people and organizations must not retain
an entry path.

## Decision

A **Member identity** is a normalized email address plus every live
`OrgRespondent` row carrying that address. Resolution uses `normalizedEmail` and a
case-insensitive fallback for legacy rows, excludes soft-deleted Respondents and
organizations, and always returns a set. The address, not any one roster id, is the
identity placed in the sealed Member session.

The set is resolved again for each protected request. It is never collapsed with
`findFirst`, frozen into the session, or inferred from submissions. A live roster
row is sufficient to request and redeem a sign-in link even when the Member has no
completed assessment.

## Consequences

- One person may simultaneously hold different Levels in different organizations.
- Report scope is the union derived from all current rows for the address.
- Removing the last live roster row prevents future redemption and protected-page
  access without managing a second account lifecycle.
- Email-address changes deliberately change the Member identity and require a new
  sign-in link.
- ADMIN/STAFF/COACH accounts and Member sessions remain separate authentication
  paths, even when they share an email address.
