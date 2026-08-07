---
status: accepted
---

# Report-native comparison and CEO self-access

## Decision

1. Comparison is a read model over frozen submissions, not a persisted report.
2. Each comparison has a focus submission plus one earlier baseline only.
3. ADR-0016 remains in force except for exact-key/type/scale question deltas in
   this report-native surface.
4. Aggregate deltas remain same-version-only.
5. Operator and CEO-self viewer policies are separate. A CEO-self viewer is
   identified by `AssessmentCampaignParticipant.isCEO`, never by `User.role`.
6. CEO access is an expiring capability exchanged into an exact-path sealed
   cookie.
7. The single-round group report and group-over-time comparison are outside
   scope.
8. All three launched report styles render the same comparison facts.

## Consequences

The comparison stays derived from authoritative frozen submission data, so it
does not create a second report lifecycle or persistence contract. The narrowly
scoped question-level exception lets the report surface exact comparable facts
without weakening ADR-0016's general longitudinal policy; aggregate reporting
continues to require same-version comparability.

Separating operator authorization from CEO self-access prevents a convenience
capability from inheriting broader operator powers. The CEO capability is
short-lived and becomes an exact-path sealed cookie before rendering. Group
comparison remains deliberately unimplemented, and report presentation cannot
change the underlying facts by style.
