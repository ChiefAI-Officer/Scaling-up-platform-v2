# PLAN — Wave L (L3 + L4): LVA group-report fidelity

This PR does **L3 + L4 together** (per the 2026-06-26 interview, which superseded the earlier "L3-only, defer L4" call). **Action: align `docs/specs/v7.6/18l-wave-l-lva-fidelity-plan.md` to match** so there is one source of truth (resolves R1-M1).

Display-layer only. NO migration, NO re-seed, NO flag. MUST NOT change the 1–3 stored scale, the aggregation math, or the CEO-included denominator. Surface is DARK behind `WAVE_F_GROUP_REPORT_ENABLED` (default-OFF) — nothing user-facing changes on merge. Files: `src/src/lib/assessments/group-report-model.ts`, `src/src/components/assessments/QualitativeGroupReport.tsx` (+ a small LVA label/intro constants module). Evidence: `docs/specs/v7.6/18-lva-source-fidelity-audit.md`.

## L3 — rating value on Esperto's 0–10 scale (LVA-only, not a generic rating change)
1. Add `scaledValue: number | null` to `GroupRatingFactor` (optional display metadata). `mean` (raw 1–3) is untouched and remains the sort key + provenance. Non-LVA rating sections keep `scaledValue = null` (R1-M2).
2. Compute `scaledValue` ONLY for LVA S3: gate on `templateAlias === "leadership-vision-alignment"` AND `section.stableKey === "S3_strengths"`. Formula from existing buckets: `ceil1((10*strong + 5*avg + 0*weak) / n)`, `n = strong+avg+weak`. Anchors Weak=0/Avg=5/Strong=10. The 0/5/10 mapping is LVA-S3-specific and must not leak into the generic rating contract.
3. `ceil1(x) = Math.ceil(x*10 - 1e-9) / 10` (round UP, float-safe): exact 5.0→5.0, 10.0→10.0, 8.333→8.4, 1.667→1.7.
4. **Display formatter:** scaled rating values use a dedicated fixed-one-decimal formatter (`x.toFixed(1)`), NOT `formatGroupNumber` (which renders 5.0 as "5" and 10.0 as "10") (R1-M5). Renderer shows `scaledValue` when non-null, else falls back to raw `mean` (R1-M2). Legend: "value on a 0–10 scale (10 = strong)".
5. Sort stays keyed on raw `mean` (monotonic with `scaledValue`); two factors may display the same scaled number — correct (matches Esperto), not a sort bug.
6. **S3 value-domain validation (R1-M6 + R2-M3):** before computing the scaled display, validate each LVA S3 answer ∈ {1,2,3}. If a factor has ANY out-of-domain value (imported/legacy rows can produce these even though the live survey cannot), emit `scaledValue = null` for that factor (renderer falls back to raw `mean`) AND record a degraded/anomaly signal in provenance — so raw mean/sort and scaled display never silently disagree. Valid {1,2,3} data is aggregated EXACTLY as today (no change to valid-data aggregation or denominator). Tests must cover the imported/legacy out-of-domain path and the all-equal (min==max) degenerate case.

## L4 — report labels + section intros (group report only)
7. **Normalized factor-key label map (R1-M3):** key the `reportLabel` map by the bare factor slug (`FACTOR_STABLE_KEYS`, e.g. `recruitment`, `retaining_staff`). Normalize BOTH shapes to that slug: S3 rating rows are `S3_<slug>` (strip the `S3_` prefix); S4 obstacle options are already `<slug>`. ~6 entries differ from survey labels: `Recruitment of new staff`, `Keeping employees`, `Leadership team`, `The Leadership`, `Internal Communication`, `Financing growth`.
8. Apply the override at the group-report DISPLAY layer to BOTH the rating section AND the obstacles (choices) section. Unknown slug → fall through to existing `meta.label` (no crash). **S5 "Why is X a hindrance?" headings are EXCLUDED** — they are question labels, not factor labels (decision per R1-M3).
9. **Verbatim section intros (R1-L2 + R2-L1)** — checked string table, source = `Leadership_Vision_Alignment_Group_report_…pdf`:
   - `S3_strengths` (p7) — CONFIRMED: "The team rated the company with 16 factors that affect the success of an organization. Each factor was rated with 'strong', 'average' or 'weak'."
   - `S4_obstacles` (p8) — CONFIRMED: "We asked about the biggest constraints to reach the goals of the company. This is what the team rated:"
   - `S1_financials` / `S2_vision` (p3–p5) and `S6_focus` (p9–p11) — TO EXTRACT char-for-char from the cited pages BEFORE coding (not yet transcribed — do NOT guess/paraphrase).
   Render one confirmed sentence under each group-section heading; do NOT use the seed `description` (paraphrase); an unconfirmed/missing intro → render nothing until transcribed. Renderer tests assert the EXACT confirmed strings (and the label table in #7, also from p7/p8).
10. Labels + intros live in a code constants module (display-layer, global/retroactive like report-config) — explicitly NOT the version-pinned seed; document they apply to all LVA versions.

## Edge cases / unhappy paths
11. Degenerate cohorts: factors nobody answered are already skipped; `n≥1` for every included factor → no divide-by-zero. Section with zero factors → `buildRatingSection` returns null (unchanged).
12. No-CEO graceful-degrade: denominator stays "all present respondents" (no CEO ⇒ all team). L3 does not special-case the CEO and does not touch the denominator.
13. Orphan respondents: out of scope — L3/L4 must NOT alter who is aggregated; preserve current `buildRatingSection` membership. Surface (don't fix) if it looks wrong.
14. Legend `n` (R1-L1): drop the single global `n` from the rating legend, OR render per-factor `n`, when factor denominators differ (partial S3 answers); don't imply a uniform `n`.
15. Rounding faithfulness verified only at N=3; document `ceil1` as empirically-matched-at-N=3, may differ <0.1 from Esperto at other N — acceptable on a dark feature; revisit with a non-N=3 sample if launched.

## Data integrity / regressions
16. Pure display change: no DB writes, no schema, no scoring/aggregation change → no partial-failure or concurrency surface (report is read-only, recomputed per view).
17. **Fix the render-test fixtures + expectations (R1-M4):** the 3 hand-built `GroupRatingFactor` fixtures in `group-report-render.test.tsx` need `scaledValue`, and assertions must be DERIVED FROM BUCKET COUNTS, not rounded raw means. Correct values: F_recruit (2S+1A) → **8.4**; F_culture (2A+1W) → **3.4**; F_cash (1A+2W) → **1.7**. (The earlier "7.2" was the reverted midpoint formula — do not use it.)
18. Confirm no other consumer reads the rating value: the email twin (`report-email.ts`) does not render the group rating (group report is screen-only); the scored group report (`ScoredGroupReport`) is a separate path — verify both untouched by grep before finishing.

## Verify
19. TDD: model unit tests for `scaledValue` — the 5 observed compositions, `ceil1` edge cases at N=2/4/7, an exact-5.0/10.0 float case, the LVA-gate (non-LVA → null), and the malformed-value bucketing case; label-map tests for BOTH S3 rating rows and S4 options; intro-render tests.
20. Gate: `CI=true npx next build --turbopack`, ESLint 0 on changed files, full suite zero NEW failures. Branch off `origin/main`; stop before merge for review.

## Provenance / audit (R2-M1)
21. This is a code-only render change with no `contentHash`/`versionId` bump, so add a stable **group-report render version** constant (e.g. `GROUP_RENDER_VERSION = "lva-fidelity-v1"`, mirroring the per-respondent `REPORT_FILTER_VERSION` pattern) covering the scale + label + intro ruleset. Record it in the model provenance and in the `GROUP_REPORT_VIEW` audit `changes` payload, and **bump it whenever the scale, label map, or intro constants change**. Assert it in tests so a viewed/replayed report is attributable to the exact ruleset in force. Also carry the per-factor degraded/anomaly signal from #6 into provenance.

## Changelog

### Round 3 (Codex final review, read against the code) — 0 findings. CLEAN.
- No material findings. Codex verified the plan's claims against the actual code (`buildRatingSection` buckets, S3-vs-S4 key shapes, `formatGroupNumber` usage, no email/scored consumer of the rating value) and had nothing left to flag. Loop converged 8 → 4 → 0, zero high-severity in any round. Plan is build-ready.

### Round 2 (Codex security & data-integrity review) — 3 medium, 1 low, 0 high. All 4 taken.
- **R2-M1 (audit/provenance drift)** — TAKEN. Added a `GROUP_RENDER_VERSION` provenance + `GROUP_REPORT_VIEW` audit recording (item 21), bumped on any scale/label/intro change, asserted in tests — so a code-only render change is still attributable.
- **R2-M2 (spec still says L3-only — R1-M1 not actually resolved)** — TAKEN + DONE NOW. Edited `docs/specs/v7.6/18l-wave-l-lva-fidelity-plan.md` to remove the "L3 only / defer L4" language and state L3+L4 are both in this PR (superseded via the /claudex:plan interview). Spec and PLAN now agree.
- **R2-M3 (raw mean vs scaled inconsistency on malformed/imported rows)** — TAKEN. Item 6 now validates LVA S3 values ∈ {1,2,3} before the scaled computation; out-of-domain → `scaledValue=null` (fall back to raw mean) + degraded signal, so mean/sort and scaled display can't silently diverge; imported/legacy path is tested. Valid-data aggregation unchanged.
- **R2-L1 (intro strings under-specified)** — TAKEN. Item 9 now carries the checked string table: 2 intros transcribed verbatim with page refs (p7, p8), the rest explicitly marked TO-EXTRACT from cited pages before coding (no guessing); tests assert exact strings.
- REJECTED: none.

### Round 1 (Codex senior-engineer review) — 6 medium, 2 low, 0 high. All 8 taken.
- **R1-M1 (scope conflict)** — TAKEN. PLAN now states L3+L4 are both in this PR per the interview, and adds an action to align `18l-wave-l-lva-fidelity-plan.md` (which still says "L3 only / defer L4") so there's one source of truth.
- **R1-M2 (LVA scaling leaking into generic contract)** — TAKEN. `scaledValue` is now optional/nullable, gated to `alias === leadership-vision-alignment` + `S3_strengths`; non-LVA rating sections keep it null and the renderer falls back to raw `mean`.
- **R1-M3 (label key-space mismatch)** — TAKEN. Map is keyed by the bare factor slug; both `S3_<slug>` rating keys and `<slug>` S4 option keys normalize to it; tests cover both. S5 headings explicitly excluded (question labels, not factor labels).
- **R1-M4 (wrong 2.7→7.2 test expectation)** — TAKEN. Critical catch: `7.2` was the reverted midpoint formula. Corrected to bucket-derived values (F_recruit 2S+1A → 8.4, etc.); test expectations must derive from bucket counts, never from rounded raw means.
- **R1-M5 (formatGroupNumber drops one decimal)** — TAKEN. Scaled values use a dedicated `toFixed(1)` formatter so 5.0→"5.0" and 10.0→"10.0".
- **R1-M6 (malformed slider value silently → avg)** — TAKEN as a documented policy + test (LVA S3 ∈ {1,2,3}; existing min/max bucketing is pre-existing behavior, not changed by L3, since aggregation is out of scope).
- **R1-L1 (misleading legend n)** — TAKEN. Drop the global legend `n` (or render per-factor) when denominators differ.
- **R1-L2 (under-specified intro strings)** — TAKEN. Added an explicit step to freeze a char-for-char intro/label string table with PDF page refs before coding L4b.
- REJECTED: none.
