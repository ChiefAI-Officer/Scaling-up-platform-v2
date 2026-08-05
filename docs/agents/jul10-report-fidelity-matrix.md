# July 10 Row #33 - Report Fidelity Matrix

## Disposition

Row #33 remains **NEEDS DECISION**. The exact July 10 ask says the reports are
close but not fully aligned and that Jeff will provide detailed side-by-side
feedback. Existing renderer tests and source-fidelity work prove substantial
structure and content, but they do not define or prove visual acceptance for
every report.

This audit was source-safe: it used the tracked source inventory and documented
findings without opening, copying, rendering, or quoting source artifacts that
may contain personal data. It changed no production state.

## Authority and renderer inventory

| Family | Sanitized source authority | Current independent evidence | Remaining authority gap |
| --- | --- | --- | --- |
| LVA | Five report captures plus one workbook | Qualitative routing, answered-only behavior, LVA filtering, group scale/labels/intros | Literal cover, mean, rehire, and pagination choices |
| Scaling Up Full | Thirteen report captures plus two workbooks | Scored routing, no-tier policy, group dispatcher, controlled-score sources | No current field/layout matrix or rendered golden |
| Rockefeller | Six report captures plus one workbook | Scored/no-score-table policy and sanitized import/score golden | No source-to-current visual diff |
| QSP v1 | One individual report plus one workbook | Qualitative routing and shared renderer tests | No detailed individual diff; no group source or supported group surface |
| QSP v2 | Three individual and one group report plus one workbook | Qualitative routing and QSP v2 group allowlist | No field-by-field or rendered-PDF golden |
| Scaling Up Quick | Workbook only | Deterministic default scored renderer | No original report output authority |
| Website Scaling Up variant | Workbook only | Deterministic default scored renderer | No original report output authority |
| Report email | No inventoried Esperto email output | Shared policy dispatch and dedicated HTML tests | Scope and visual target are undefined |

Current authority lives in
[report-config.ts](../../src/src/lib/assessments/report-config.ts),
[BrandedReport.tsx](../../src/src/components/assessments/BrandedReport.tsx),
[QualitativeReport.tsx](../../src/src/components/assessments/QualitativeReport.tsx),
and the scored/qualitative group renderers. Their automated tests prove routing,
content policy, and model shape, not a pixel or PDF match.

## Report-by-report comparison matrix

| Surface | Independently verified | Gap or decision needed | Disposition |
| --- | --- | --- | --- |
| LVA individual | Qualitative route, answered-only sections, S3 suppression, and selected-obstacle follow-ups | Original photo/signature/mean-oriented presentation was deliberately omitted; Jeff must say whether literal parity is required | Do not change without an annotated pair |
| LVA group | Original 0-10 scale/ceil, label overrides, and section intros are implemented | Confirmed residual: the original rehire percentage bar is a plain number/Q&A today | First comparison candidate; change only if Jeff flags it |
| Scaling Up Full individual | Scored, no-tier policy is enforced | Report anatomy and benchmark presentation lack a current visual golden; benchmark semantics belong to #32 | Request a dedicated annotated pair |
| Scaling Up Full group | Separate scored-group dispatcher and gate exist | No matching source/current golden for peers, anonymous members, or pagination | No #33 completion claim |
| Rockefeller individual | Scored/no-score-table policy and controlled-score parity are tested | Cover, score presentation, section treatment, and print layout lack a visual diff | Request a dedicated annotated pair |
| Rockefeller group | Generic scored renderer and independent default-off gate exist | Authoritative team report has no documented side-by-side; expected team view needs approval | Keep dark unless separately approved |
| QSP v1 individual | Qualitative policy and shared structural tests exist | No detailed source/current visual diff | Request a dedicated annotated pair |
| QSP v1 group | No current group allowlist | No source baseline and no supported current group surface | Out of scope unless Jeff identifies it |
| QSP v2 individual/group | Qualitative policy and QSP v2 group allowlist exist | No field-by-field or rendered-PDF golden; group is default-off | Request a surface-specific annotation |
| Scaling Up Quick / Website variant | Default scored routing is deterministic | Workbooks define content, not an original report layout | Exclude until an original or approved target exists |
| Report emails | Distinct HTML renderer has content/escaping tests | Jeff has not said whether “All Reports” includes email, and no Esperto email output is inventoried | Clarify before adding scope |

## Six evidence gaps

1. The LVA group rehire result does not reproduce the original percentage-bar
   presentation.
2. Scaling Up Quick has no original report output authority.
3. The Website Scaling Up variant has no original report output authority.
4. QSP v1 has neither a group baseline nor a supported group surface.
5. No per-family visual/PDF golden suite is tied to the source reports.
6. Scaling Up Full, Rockefeller, and QSP v1/v2 lack complete current
   source-to-render matrices.

Documented omissions such as LVA photo/signature, the individual Mean column,
and branded chrome are not reclassified as defects without Jeff's direction.

## Smallest approval-ready next step

Jeff supplies one sanitized annotated original/current pair at a time using:

- report family and surface: individual, group, print/PDF, or email;
- sanitized page or section locator;
- expected and current observable behavior;
- discrepancy class: content, number, structure, or visual preference;
- explicit acceptance statement.

Start with the LVA group rehire presentation, the only confirmed residual visual
divergence. Each accepted discrepancy becomes its own narrow row/PR; #32
benchmark semantics remain separate.

## Post-July 31 progress delta boundary

The next delta contains exactly these nine merged and production-verified
product or reliability outcomes:

1. GH #222 / PR #269 - Welcome question-bank accuracy.
2. GH #242 / PR #273 - retired pinned-edition warning.
3. GH #243 / PR #275 - campaign-list edition visibility.
4. GH #224 / PR #278 - truthful Welcome sharing disclosure.
5. GH #217 / PR #280 - legacy invitation fallback hardening, dormant path.
6. Jeff #65 / PR #282 - stable reminder links, enabled.
7. GH #228 / PR #288 - report-email branding, deployed default-off.
8. GH #220 / PR #292 - branded invitation HTML composition, deployed
   default-off.
9. GH #257 / PR #296 - residual outbox reconciliation, deployed default-off.

Do not count #33's disposition, documentation/receipt PRs, or GH #233's
observational auditability surface as new product outcomes. Default-off items
must not be described as active customer-visible behavior.
