# 19aq — SunHub eight-question quick quiz design

Status: approved for implementation by Gabriel's July 10 closeout direction on
2026-08-08: "prime 84 for build," "we have everything we need," and "Proceed to
item closeout." This design does not authorize a Production seed, publish,
campaign, email, flag, or data mutation.

## Acceptance boundary

July 10 row #84 asked for the build status of the SunHub "Scaling Up 4
Decisions Quick Quiz": eight questions with end feedback about use of the
Scaling Up methodology. The supplied workbook is now the visual and content
source of truth:

`From Jeff/APP_scaling up assessemnt/SunHub_ScalingUpQuiz/SU-Quiz.xlsx`

The existing 32-question `scaling-up-quick` instrument is a different public
assessment and must remain byte-for-byte unchanged.

## Source-backed instrument

- New template alias: `sunhub-quick-quiz`.
- Name: `Scaling Up 4 Decisions Quick Quiz (SunHub)`.
- PUBLIC-only campaign use; no coach access grant.
- Eight required `SLIDER_LIKERT` questions, one question per section/page.
- Integer 0–10 scale with `Not true` and `Completely true` anchors.
- Question order and category repeat the source: Strategy, People, Cash,
  Execution, People, Strategy, Cash, Execution.
- Overall score is the mean of all eight answers multiplied by ten and rounded
  by the existing `scaleUpScore` engine.
- The source's four bands map exactly to the possible eight-question integer
  totals: 0–24%, 25–49%, 50–74%, and 75–100%. Because the existing tier
  resolver treats the upper bound as inclusive, the stored touching seams sit
  immediately below 2.5, 5, and 7.5 on the underlying 0–10 mean. Those seam
  values are unreachable by eight integer answers, so totals 19/20, 39/40,
  and 59/60 transition exactly at displayed scores 24/25, 49/50, and 74/75.
- Only the overall score and matched feedback band are scored outcomes. The
  source does not show per-Decision result cards, so the seed does not opt into
  domain rollups and the alias hides the generic section score table.

## Result actions

For a public lead result, replace the generic conclusion actions with the three
source-owned actions:

1. Take the 32-question assessment —
   `https://scalinguptoolkit.com/s/ScaleUpQA`
2. Request a complimentary follow-up —
   `https://coaches.scalingup.com/coach-match-after-assessment-form`
3. Buy the books — `https://scalingup.com/book/`

The same actions render in the on-screen report and its emailed twin. Other
aliases retain their existing conclusion behavior. A non-public render does
not acquire public lead actions merely because it uses this alias.

The source-specific public result stays on the Classic renderer even if an
alternate appearance is present on a future campaign snapshot. This keeps the
overall-only result and three actions intact; other aliases and non-public
renders keep the normal appearance policy.

## Compatibility and safety

- Fresh `sunhub_*` stable keys; no alias reuse, import crosswalk, migration, or
  mutation of the 32-question seed.
- Reuse the existing PUBLIC quiz, scoring, frozen result, report, lead-routing,
  outbox, and consent paths.
- The seed is additive and draft-only. Publication and public campaign creation
  remain separate, explicitly authorized Production actions.
- The source screenshots are the visual review baseline. Platform chrome stays
  consistent with the shipped public quiz; content, single-question pacing,
  score, feedback, and CTA destinations are the fidelity boundary rather than
  a pixel clone of Esperto.

## Acceptance

1. A pure seed fixture contains exactly the eight source questions in order,
   each on its own 0–10 page with the exact anchors.
2. The fixture passes the publish/scoring schema and scores representative
   boundary totals into the exact four source bands.
3. The public on-screen and email report render all three source CTAs only for
   the SunHub public-result configuration.
4. Existing `scaling-up-quick` content and other report conclusions remain
   unchanged.
5. No Production state is changed by the implementation PR.
