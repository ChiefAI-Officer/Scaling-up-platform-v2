-- Reproducible report datasets derived from the reviewed Esperto catalogue.
-- These queries intentionally use literal reviewed values so the report tables
-- and chart can be reconstructed without a database connection.

-- Recommended five-level score map.
SELECT *
FROM (VALUES
  (0, 0, '0–2', 'Scores 0 and 3 observed in uniform reports; interior split inferred'),
  (3, 3, '3–4', 'Score 3 observed; interior split inferred'),
  (5, 5, '5–6', 'Directly confirmed in live question-1 sweep'),
  (10, 9, '9–10', 'Directly confirmed in live question-1 sweep'),
  (7, 7, '7–8', 'Directly confirmed in live question-1 sweep')
) AS band_map(source_level, min_score, score_range, evidence)
ORDER BY min_score;

-- Capture audit by source level.
SELECT *
FROM (VALUES
  ('0', 61, 61, 0, '1 May 2026'),
  ('3', 61, 61, 0, '1 May 2026'),
  ('5', 61, 61, 0, '1 May 2026'),
  ('7', 61, 61, 0, '1 May 2026'),
  ('10', 61, 61, 0, '1 May 2026')
) AS coverage_by_level(source_level, questions_captured, expected_questions, missing_texts, source_date);

-- Capture and quality checks.
SELECT *
FROM (VALUES
  (1, 'Unique scored questions', '61', 'All assessment sliders represented'),
  (2, 'Source levels per question', '5', '0, 3, 5, 7, and 10'),
  (3, 'Feedback records', '305', '61 questions × 5 source levels'),
  (4, 'Blank feedback records', '0', 'No missing narrative text'),
  (5, 'Question-label drift', '0', 'Exact-label join succeeded across source reports')
) AS coverage(check_order, check_name, result, interpretation)
ORDER BY check_order;

-- Adjacent source levels with identical text.
SELECT *
FROM (VALUES
  (1, '0 and 3', 59, 61, 'Often appears as one visible 0–4 response'),
  (2, '3 and 5', 4, 61, 'Boundary exists but text does not visibly change'),
  (3, '5 and 7', 0, 61, 'Every question visibly changes'),
  (4, '7 and 10', 2, 61, 'Two questions show the same high-end wording')
) AS duplicate_text(pair_order, levels, identical_questions, out_of, meaning)
ORDER BY pair_order;
