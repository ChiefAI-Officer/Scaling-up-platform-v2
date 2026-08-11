# July 10 #57 — LVA Peer Averages Settings Restore Design

## Goal

Restore the already-built LVA peer-average authoring control in the current
assessment editor without changing its data model, API, scoring, report logic,
or template identity rules.

## Confirmed current state

- The editor and report capability already exists behind Wave S.
- Production is currently dark because the panel was previously mounted below
  the entire tabbed editor, where it appeared regardless of the selected tab.
- The capability is intentionally limited to the immutable
  `leadership-vision-alignment` template alias. A newly created arbitrary
  assessment does not become an LVA merely because its display name resembles
  LVA.
- Production presently has no stored LVA benchmark rows. The available Jeff
  source file contains one respondent's answers, not a peer cohort, and must
  not be represented as peer data.

## Approved experience

For the canonical LVA template only, render the existing `PeerBenchmarksPanel`
inside the ED10 **Settings** tab as a normal settings card. It appears after
Default report appearance and before Language. It does not float below Build,
Preview, Scoring, or Versions.

The existing full-set save behavior remains unchanged: blank means no stored
row; Save atomically reconciles all non-blank rows through the existing admin
benchmark API.

## Data and compatibility boundaries

- Preserve the `AssessmentBenchmark` schema and existing editor API.
- Preserve all question stable keys, template aliases, published versions,
  report calculations, and import mappings.
- Keep the exact alias allowlist as the fail-closed assessment-family gate.
- Do not add a migration or a new feature flag.
- Do not infer, average, or persist a real peer cohort from the single-person
  Jeff export.

## Production acceptance

After merge and deployment:

1. Enable Wave S for Production and remove its kill state.
2. Confirm the LVA Settings tab shows all eligible peer-average inputs.
3. Enter a small, clearly temporary test set.
4. Confirm populated comparisons render in one existing individual LVA report
   and one existing group LVA report.
5. Capture cropped evidence that contains no respondent PII.
6. Clear every temporary value immediately and confirm Production returns to
   zero stored benchmark rows.

The UI restore closes #57's capability requirement. The two renderer receipts
close #58 independently. A genuine persistent peer dataset remains a separate
follow-on requiring an authoritative cohort source.

## Out of scope

- QSP invitation acceptance (#47).
- Scaling Up Full industry benchmarks (#32).
- Persistent LVA peer values or a benchmark-source import pipeline.
- Generalizing peer settings to user-created assessments.
