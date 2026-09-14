# ADR-0036 — Published report HTML follows the Active version

**Status:** Accepted (2026-09-15)

## Context

Admins author the Welcome and Closing HTML/CSS on a Template Version. Previously,
individual reports loaded those fragments from the version pinned to the Campaign.
Publishing a corrected version therefore changed the editor Preview but not existing
customer-facing or stored-report screens.

## Decision

Individual report screens resolve authored report HTML/CSS from the template's latest
published, non-archived version for the Campaign language. This applies generically to
every Assessment Template, including templates added later.

Only presentation follows the Active version. Questions, sections, scoring, answers,
and computed results remain tied to the Campaign's pinned version. The Template Version
editor Preview remains version-specific so an author can preview a draft before
publishing it.

The behavior is guarded by `WAVE_REPORT_HTML_ACTIVE_VERSION_ENABLED`; its kill switch
wins. If the flag is off, no Active-version lookup occurs. If no Active version exists
or the lookup fails, the report uses the pinned version's safe HTML/CSS.

## Consequences

- Publishing an HTML/CSS correction updates the public on-screen result, invited
  on-screen result, and later stored individual-report views for that template and
  language without changing historical scores.
- Provenance records both the pinned scoring version and, when resolved, the
  presentation version.
- Report email, group/aggregate reports, and generated graph behavior are unchanged.
- No schema or data migration is required.
