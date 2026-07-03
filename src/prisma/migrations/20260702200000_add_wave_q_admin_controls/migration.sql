-- Wave Q (Jul 2 2026) — admin & coach controls (Jeff July-1 #1/#6/#7, spec 19q).
--
-- Three additive columns, no destructive ops, no data movement, no FK changes,
-- no index:
--
--   assessment_templates.sendResultsDefault (BOOLEAN NOT NULL DEFAULT false) —
--   #1: template-level default for the per-campaign sendResultsToRespondent
--   toggle. Backfills everything to false = current behavior. Inert unless the
--   template's results-email content is approved (approval always wins).
--
--   assessment_templates.disabledAt (TIMESTAMP NULL) — #6: "disabled" third
--   lifecycle state (distinct from deletedAt soft-delete): hidden from
--   NEW-campaign pickers + rejected at campaign create; existing campaigns,
--   reports, trends, re-seeds untouched. null = enabled.
--
--   users.deletedAt (TIMESTAMP NULL) — #7: soft admin removal (ADR-0018).
--   Enforced at login + per-request liveness, deliberately not flag-gated.
--   null = live account.

ALTER TABLE "assessment_templates" ADD COLUMN "sendResultsDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "assessment_templates" ADD COLUMN "disabledAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3);
