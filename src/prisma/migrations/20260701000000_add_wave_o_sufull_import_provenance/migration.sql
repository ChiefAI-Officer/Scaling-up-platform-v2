-- Wave O (Jul 1 2026) — historical Esperto SU-Full import provenance.
--
-- Adds two nullable columns, no destructive ops, no default, no data
-- movement, no FK changes, no index:
--
--   assessment_campaigns.importManifest (JSONB) — the redacted round manifest
--   for an imported SU-Full round (cid, canonical roundLabel, batch content
--   fingerprint, per-respondent {saltedMidHash, saltedReportIdHash, answerHash}
--   for exact/superset/divergent reuse reconciliation, versionId, crosswalkId,
--   skip reasons). NEVER raw mid/reportid/email/demographics. null = not an
--   imported round.
--
--   organizations.espertoSuFullCid (TEXT) — pinned lazily on the org's first
--   successful SU-Full historical import; a later import batch whose file
--   `cid` differs from this pin is a wrong-org signal and is refused. null =
--   no SU-Full import yet for this org.
--
-- The whole capability is held dark behind WAVE_O_ESPERTO_SUFULL_IMPORT
-- (default-OFF) and the SU-Full crosswalk stays locked:false until Phase 2's
-- lock-checklist clears, so nothing writes to either column until launch.
--
-- Spec: PLAN.md (Historical Esperto Import — SU-Full first); ADR-0017;
-- docs/specs/v7.6/18o-ops-runbook.md.

ALTER TABLE "assessment_campaigns" ADD COLUMN "importManifest" JSONB;
ALTER TABLE "organizations" ADD COLUMN "espertoSuFullCid" TEXT;
