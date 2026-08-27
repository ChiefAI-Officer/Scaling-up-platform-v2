# Accepted Scaling group-report comparison artifact: de-identification audit

Date: 2026-08-27

## Committed artifact

- Path: `docs/research/evidence/platform-scaling-group-report-candidate-jeff-approved-2026-08-27-deidentified.png`
- Dimensions: 1440 × 5654 pixels
- SHA-256: `0842e2816e965a9419b111018c2e5b3c4d330f823c5d8c3b8e28df58e64a6cee`
- Purpose: durable visual comparison source for the accepted Scaling Up group-report hierarchy, palette, density, peer values, and appendix treatment.

## Audit method and result

The locally supplied source image was reviewed at full resolution and by focused cover, provenance, and footer crops. Its visible text was also extracted for a second pass. The source contained a demo coach label and thumbnail, a demo organization label, a demo CEO label, and repeated footer identity chrome.

The committed artifact replaces every observed identity-bearing label with `Sample Coach`, `Sample Organization`, or `SAMPLE CEO`; replaces both visible identity thumbnails with neutral generated marks; and rewrites the provenance strip with deterministic sample-only values. No e-mail address, account identifier, source-system identifier, respondent identifier, or source image filename is embedded in the committed artifact.

The raw source image and intermediate crops remain local, untracked inputs and are not committed. The de-identification changes deliberately preserve the accepted report's page geometry, section sequence, score values, question-level peer values, typography, and purple/blue/orange visual language.

Result: **PASS — safe de-identified comparison artifact.**
