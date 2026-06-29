# LVA Source-Fidelity Audit (corrected, evidence-backed)

**Date:** 2026-06-26
**Question answered:** How faithful is the current Leadership Vision Alignment (LVA) implementation to the original Esperto source materials?
**Source set:** `From Jeff/APP_scaling up assessemnt/APP_leadership vision alignment assessment/` — the workbook `leadership visin alignment assement.xlsx` (5 tabs) + 4 individual sample report PDFs + 1 group report PDF.

---

## 0. Correction to the record (why this audit exists)

A prior pass reported the questionnaire layer as "mostly faithful" and described Wave I as "done." Both were **overclaims**:

- **The first pass read only cell text.** It parsed `xl/sharedStrings.xml` from the workbook's one text tab (`Questions`) and never opened the other **4 tabs** or the **38 embedded screenshots** (`xl/media/*.png`). Any fidelity claim that depended on content inside those images was unverified.
- **"Wave I done" ≠ "LVA faithful."** Wave I shipped *one slice* — the conditional-obstacles report/form behavior — and that slice is faithful. But for an Esperto **replacement**, *faithfulness to source is the acceptance test*, and the LVA as a whole still has real fidelity gaps (input widget, pagination, group-report scaling, questionnaire wording). Calling a merged slice "the LVA is done" conflated two different claims.

This document is the corrected, full-evidence answer. **All 5 tabs and all 38 screenshots have now been reviewed**, plus the rating/financials/obstacles pages of the group report PDF.

> **Method note (no MCP required):** an `.xlsx` is a zip — `unzip` it, the screenshots are plain PNGs under `xl/media/`, and the tab→image map is in `xl/drawings/_rels/`. PDF pages render to PNG via `pdftoppm`. See [[reference_xlsx_embedded_screenshots]].

---

## 1. What the source actually contains

The workbook has **5 tabs**:

| Tab | Content |
|-----|---------|
| `Questions` | the question bank as cell text (the only tab the first pass read) |
| `Screen Shots` (26 imgs) | the real Esperto **participant survey UI**, page by page |
| `Setup` (7 imgs) | Esperto **campaign-creation wizard** (Variant → Mail → Assessed Members/CEO → Participants → Overview) |
| `summary report` (4 imgs) | the **"CEO Full Report"** group-report build wizard |
| `email` (1 img) | email-template reference |

The rendered report PDFs (individual + group) are the authoritative output spec.

---

## 2. Fidelity by layer

### 2.1 Questionnaire content — **FAITHFUL** (wording paraphrases only)
- 16 factors verbatim, including the intentional `The leadership` (matrix) vs `The Leadership` (checkbox) case split.
- S4 = MULTI_CHOICE, max 3, prompt verbatim. S3 = 3-point Strong/Average/Weak. S5 = 16 per-factor "Why is X a hindrance?" + 2 always-on. Section set/order match.
- **Divergence (low, = open #29 content):** S1 financial labels are reworded (we append "in three years" + question form; source uses present-tense labels under a "it is three years later…" intro — `Screen Shots` image5). Section names/intros are paraphrased, not verbatim. These are the *content* half of the deferred #29 reconcile (owner-gated, forward-only re-seed).

### 2.2 Survey form UX — **DIVERGENT** (new findings, invisible to a text-only read)
- **S3 input widget.** Esperto renders the 16-factor strengths question as a **3-column radio matrix `Strong | Average | Weak` (Strong on the left), on one page** (`Screen Shots` image10). We model it as **16 separate slider questions** (1–3, anchored Weak→Strong). Scale *semantics* match; the widget, single-page matrix layout, and left→right direction differ. → **Wave L (L1)**.
- **Pagination.** Esperto is **one question (or one tight group) per page** with Previous/Next + a thin progress bar (image5–30). We use a **section pager** (Wave C/G put a whole section on one page). Deliberate UX choice on our side, but a real departure from source. → **Wave L (L2)**.

### 2.3 Individual report — **FAITHFUL** (Wave I confirmed against source)
- **S3 strengths matrix is absent** from the original individual report (no rating grid across the fully-read 9-page reports). Our `REPORT_FILTERS.suppressSections:["S3_strengths"]` matches.
- **S5 is conditional in Esperto's own form** — *visually proven*: `Screen Shots` image11 shows S4 with The Leadership / Culture / Strategy checked; image12 (next page) shows exactly those three "Why is X a hindrance?" boxes and no others. The per-person obstacle headings also differ between the John and Kathy individual PDFs. Our `conditionalFollowups {gateKey:"S4_biggest_obstacles", followupPrefix:"S5_why_"}` reproduces this; the email twin shares the same model.
- **Deliberate cosmetic differences (not defects):** individual report drops the financials "Mean" column (Mean lives in the group report); Verne Harnish photo/signature omitted (text-only).

### 2.4 Group report — **MOSTLY FAITHFUL**
- **Faithful:** CEO-vs-team financials matrix (Mean/CEO/each — p3; Mean = arithmetic mean rounded, e.g. customers (300+285+275)/3≈287 ✓), 16-factor stacked Weak/Average/Strong rating (p7), obstacles as %-of-answerers with all options incl. 0% sorted desc (p8 — 67%=2/3, 33%=1/3), free-text collation with `(CEO)` marker. No benchmark/peers column in source — ours correctly has none. Correctly NOT touched by the Wave I individual filter (group keeps the S3 matrix, which the source group report retains at p7).
- **Divergence (medium): rating value scale.** See §3 — Esperto prints a 0–10 midpoint-scaled value; we print the raw 1–3 mean. → **Wave L (L3)**.
- **Divergence (low): rehire-%** rendered as a plain number Q&A instead of Esperto's green per-respondent percent-bar + Mean. → **Wave L (L4)**.
- **Divergence (low): report factor labels.** The Esperto *report* uses slightly different label strings than the survey form (p7/p8: "Recruitment of new staff", "Keeping employees", "Internal Communication", "Financing growth") vs our report reusing the survey labels ("Recruitment of new employees", "Retaining staff", …). → **Wave L (L4)**.
- **Divergence (low):** section intro sentences dropped at group level.

### 2.5 Scoring / scale formula — **SOLVED (reverse-engineered)**
Not present anywhere in the workbook (checked all 5 tabs + 38 images) or as Esperto-exposed config. Reverse-engineered from group report p7; see §3.

---

## 3. The rating scale formula (reverse-engineered, validated)

**CORRECTION (2026-06-26):** an earlier draft hypothesized a *midpoint* mapping (Weak 1.67 / Average 5.0 / Strong 8.33). Pixel-measuring the p7 bars (exact thirds at N=3) **falsified** it — the true mapping is clean **0 / 5 / 10**. Both reproduce the same five printed values *only because* N=3 makes the segments exact thirds; they diverge elsewhere (2-Strong-1-Average → 0/5/10 gives 8.33 ✓, midpoint gives 7.22 ✗). 0/5/10 is correct.

Each S3 category maps to a point on a **0–10 axis as clean thirds**:

- **Weak → 0** · **Average → 5** · **Strong → 10**
- Displayed factor value = **arithmetic mean** of every respondent's anchor value (**CEO included** — see denominator below), **rounded UP to 1 decimal** (Esperto ceilings: 8.33→8.4, 3.33→3.4; 6.67→6.7 and 1.67→1.7 unaffected).
- From our 1–3 scale: `displayValue = ceil₁((mean₁₋₃ − 1) × 5)`; from buckets: `ceil₁((10·strong + 5·avg + 0·weak) / n)`.

**Validation (group report p7, N=3 — pixel-measured compositions):**

| Factor composition (of 3) | mean of {0,5,10} | ceil→1dp | Esperto prints |
|---|---|---|---|
| 2 Strong + 1 Average | 8.33 | 8.4 | 8.4 ✓ |
| 1 Strong + 2 Average | 6.67 | 6.7 | 6.7 ✓ |
| all Average / 1S+1A+1W | 5.00 | 5.0 | 5.0 ✓ |
| 2 Average + 1 Weak | 3.33 | 3.4 | 3.4 ✓ |
| 1 Average + 2 Weak | 1.67 | 1.7 | 1.7 ✓ |

**Denominator — ALL respondents INCLUDING the CEO** (not team-only). Proven by exact arithmetic on the rendered report: financials Mean p3 = (18+10+10)/3 = 13; rehire Mean p11 = (100+90+99)/3 = **96.33%**; obstacles p8 = 67% (2/3) & 33% (1/3); corroborated by Rockefeller's team matrix (Average closes only with the CEO counted, n=5). The conflicting Setup-screen label *"CEO results compared with the averages of individual leader reports"* was an over-read — the CEO is one of the leaders, so the average includes them. `buildRatingSection` already aggregates all cohort respondents incl. CEO, so **no denominator change is needed**.

**Confidence: HIGH** — formula, denominator, and rounding all reproduce the rendered report exactly. **Current code:** `group-report-model.ts` prints the raw 1–3 mean (e.g. `2.3`); the faithful display is `ceil₁((mean − 1) × 5)`.

---

## 4. Overall verdict & fidelity backlog

**The LVA is content-faithful and report-faithful, but not yet form-faithful or scale-faithful.** Wave I closed the conditional-obstacles gap correctly; the remaining gaps are catalogued below and scoped in [18l-wave-l-lva-fidelity-plan.md](18l-wave-l-lva-fidelity-plan.md).

| Gap | Layer | Severity | Home |
|---|---|---|---|
| S3 radio-matrix input (vs sliders) | survey UX | medium | Wave L (L1) |
| One-question-per-page (vs section pager) | survey UX | medium | Wave L (L2) |
| Group rating value 0–10 scaling (vs raw 1–3 mean) | group report | medium | Wave L (L3) |
| Rehire-% percent-bar + report factor labels + section intros | group report | low | Wave L (L4) |
| S1 financials wording + verbatim section intros | questionnaire | low | #29 (owner-gated re-seed) |

---

## 5. Evidence index
- Workbook tabs/images: `Screen Shots` image5 (S1 intro + financials), image10 (S3 radio matrix), image11→12 (S4→S5 conditional proof), image15 (rehire %), `Setup` image31–37 (campaign wizard), `summary report` image1–4 (CEO Full Report wizard).
- Group report PDF: p3 (financials matrix), p7 (rating + scale values), p8 (obstacles %).
- Code: `src/prisma/seed-lva-assessment.ts`; `src/src/lib/assessments/qualitative-report-model.ts` (REPORT_FILTERS); `src/src/lib/assessments/form-visibility.ts`; `src/src/lib/assessments/group-report-model.ts`; `src/src/components/assessments/QualitativeGroupReport.tsx`.
