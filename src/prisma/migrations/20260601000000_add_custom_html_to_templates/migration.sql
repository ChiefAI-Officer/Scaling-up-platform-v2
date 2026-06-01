-- TEMPLATE-02 (Jun 3 2026) — Custom HTML override on landing-page templates.
--
-- Adds two nullable TEXT columns mirroring the existing customCode pattern:
--   - PageTemplate.customHtml: admin-edited HTML on /admin/templates/[id]/edit
--     (SOLO_LANDING + DUO_LANDING only). Sanitized via DOMPurify on save.
--   - LandingPage.customHtml: build-time snapshot, copied from the source
--     PageTemplate after variables are HTML-escaped + interpolated, so the
--     value persisted here is already sanitized (DOMPurify) and escaped.
--
-- The public /workshop/[slug] route reads the stored sanitized value via the
-- React HTML-injection prop. All XSS gates run at save-time + interpolation;
-- render is a trusted echo of the already-sanitized string.
--
-- Non-destructive: nullable columns, no defaults, no data movement, no FK
-- changes. Existing rows get NULL on both columns — zero regression.
--
-- Plan: ~/.claude/plans/previous-instance-crashed-with-glittery-cake.md
-- Notion: https://www.notion.so/3728c45dd829819aa9e3dac61a798bcb

ALTER TABLE "page_templates" ADD COLUMN "customHtml" TEXT;
ALTER TABLE "landing_pages" ADD COLUMN "customHtml" TEXT;
