-- Wave M (Jun 30 2026) — coach-authored custom slides on a campaign.
--
-- Adds one nullable JSONB column holding a CustomSlide[] (id, optional title,
-- sanitized html, position {start|before-section:<stableKey>|end}, sortOrder).
-- The participant survey weaves these in as non-counted interstitial pages.
--
-- Non-destructive: nullable column, no default, no data movement, no FK
-- changes, no index. Existing campaigns get NULL — zero regression. The
-- feature is held dark behind WAVE_M_CUSTOM_SLIDES_ENABLED (default-OFF), which
-- also gates the write path, so nothing populates this column until launch.
--
-- Spec: docs/specs/v7.6/18m-wave-m-custom-slides-design.md
-- Plan: docs/specs/v7.6/18mn-wave-mn-implementation-plan.md

ALTER TABLE "assessment_campaigns" ADD COLUMN "customSlides" JSONB;
