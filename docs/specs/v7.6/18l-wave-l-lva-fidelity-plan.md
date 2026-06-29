# Wave L — LVA Source-Fidelity — 🚧 GATED (scope LOCKED via grill, pending /grill-me + build)

**Status:** Scope locked via `/grill-with-docs` + `/grill-me`, then planned via `/claudex:plan` (2026-06-26). NOT yet built. **This PR = L3 + L4 together (group report only)** — the `/claudex:plan` interview (2026-06-26) authorized L3+L4 in one pass, **superseding the earlier grill-me "L3 only / defer L4" call.** Implementation plan is `PLAN.md` (Codex-reviewed). Per the gated-wave rule, no code until explicit build go-ahead.

> **Grill-me outcomes (2026-06-26):**
> - **Surface is DARK.** The LVA group report (the only thing Wave L touches; Wave I removed the S3 rating from the individual report) is gated by `WAVE_F_GROUP_REPORT_ENABLED` — default-OFF, never flipped in prod. So Wave L is **pre-launch correctness work**, not user-facing-now value; its payoff is gated on the owner's WAVE_F flag-flip.
> - **L3 + L4 together** (superseded the initial "defer L4" via the /claudex:plan interview). L3 fixes the wrong number; L4 adds report-label parity + verbatim intros. All display-layer, group report only.
> - **Rounding = `ceil` to 1 decimal — RESOLVED.** Esperto prints 8.4/3.4 for means of 8.33/3.33; standard rounding gives 8.3/3.3, so it rounds UP. `ceil₁` reproduces all 5 observed values. Residual ceil-vs-near-integer-anchor ambiguity is <0.1, only at untested cohort sizes — documented, non-blocking.
> - **Live-tool check (read-only).** Logged into scalinguptoolkit.com: LVA campaign has 0 completed responses (sample data cleared), no scoring config exposed in admin, real production account → did NOT create test data. Authoritative evidence remains the rendered N=3 PDF (pixel-measured).
**Parent:** [18-jeff-june22-assessment-fidelity.md](18-jeff-june22-assessment-fidelity.md) · evidence: [18-lva-source-fidelity-audit.md](18-lva-source-fidelity-audit.md)

## Locked decisions (grill 2026-06-26)
1. **Fidelity bar = content + numbers parity.** The report's CONTENT and NUMBERS must match Esperto; survey INPUT UX may differ where ours captures the same data.
2. **Scope reclassified** by that bar (below): IN = L3 + L4-labels + L4-intros; DESCOPED = L1, L2, rehire-% viz.
3. **L3 formula NAILED** from the materials (pixel-measured) — supersedes the earlier midpoint guess.
4. **L4 labels = mirror Esperto's report labels** (report-layer map).
5. **L4 intros = verbatim Esperto report intros.**
6. **L4 surface = group report ONLY** (individual report was rated faithful; leave it).

---

## IN SCOPE

### L3 — Group-report rating value on Esperto's 0–10 scale
- **Source:** group report p7 — values 8.4/6.7/5.0/3.4/1.7.
- **Formula (NAILED — pixel-measured N=3 bars; see audit §3):** Weak→0, Average→5, Strong→10; value = arithmetic mean over **all** respondents (**CEO included**), **rounded UP to 1 decimal**. `displayValue = ceil₁((mean₁₋₃ − 1) × 5)`, or from buckets `ceil₁((10·strong + 5·avg + 0·weak)/n)`.
- **Denominator:** CEO included — our aggregation already matches; **no denominator change**.
- **Change:** display-layer only in `group-report-model.ts` (add `scaledValue`) + `QualitativeGroupReport.tsx` (render it + legend "value on a 0–10 scale"). Raw scoring/sort unchanged. **No migration.**
- **Note vs the reverted attempt:** the first L3 attempt used midpoint anchors (1.67/5/8.33) and was WRONG — it must use 0/5/10 + ceil rounding.

### L4a — Report factor-label map (group report)
- **Source:** group report p7/p8. Esperto's REPORT uses different factor strings than the survey for ~6 factors: `Recruitment of new staff` (survey: …employees), `Keeping employees` (…Retaining staff), `Leadership team` (…Leadership Team), `The Leadership` (matrix: The leadership), `Internal Communication` (…communications), `Financing growth` (…Growth Financing).
- **Change:** a static `stableKey → reportLabel` map applied in the group-report model for the rating AND obstacles sections (display-only; survey keeps its verbatim survey labels). Exact strings to be lifted verbatim from p7/p8 at implementation. **No re-seed.**

### L4b — Verbatim section intros (group report)
- **Source:** group report intro sentences (e.g. p7 "The team rated the company with 16 factors that affect the success of an organization."; p3 vision intro; p8 obstacles intro).
- **Change:** capture ~6 intro strings verbatim and render one under each group-report section heading (currently the renderer shows only the section name; the seed's `description` is a PARAPHRASE and must NOT be used — verbatim Esperto wording only). Display-only.

---

## DESCOPED (under the content+numbers bar — input/presentation UX, same data)
- **L1 — S3 radio-matrix input.** Our slider captures the identical 1–3 value (`Strong=3=max`); the widget difference changes no number or stored answer. Out (would need a re-seed for zero numeric gain).
- **L2 — one-question-per-page pagination.** Pure input flow; same data. Out (and reverses the deliberate Wave G section-pager).
- **L4 rehire-% bar.** The rehire NUMBER is already shown; only the green-bar viz differs. Out.

---

## Sequencing (when built)
All three IN items are display-layer changes to the same two files (`group-report-model.ts`, `QualitativeGroupReport.tsx`) + a label/intro constants block. One cohesive PR, TDD. No migration, no flag, no re-seed. L3 is the highest-value (corrects a wrong number); L4a/L4b are content parity.

## Resolved by the grill
- **L3 rounding = `ceil` to 1 decimal** (forced by the data; standard rounding contradicts the observed 8.4/3.4). Residual <0.1 ambiguity at untested cohort sizes, documented, non-blocking.
- **L3 + L4 both in this PR** (per the /claudex:plan interview). **L4a** report factor-label map (~6 factors, display-only) + **L4b** verbatim section intros (group report only) are no longer deferred.
- **Surface is dark** → still a pre-launch fix; no urgency to merge, but it must be correct before the WAVE_F flag flips.
- **Provenance:** a group-report render/config version is recorded in model provenance + the `GROUP_REPORT_VIEW` audit (R2-M1) so a viewed report is attributable to the scale/label/intro ruleset in force.

## Non-goals
- No change to S3 1–3 scoring, aggregation math, or the CEO-included denominator.
- No #29 questionnaire content re-seed (owner-gated, separate).
- No individual-report changes (group report only).
- Scored group engine (Rockefeller/Five-D/SU-Full) untouched.
