# Wave M — Custom Slides (punch-list #19)

**Status:** Design — grilled (`/grill-with-docs`, Q1–Q7 + defaults), awaiting user review → `/frontend-design` → implementation plan.
**Date:** 2026-06-30
**Source item:** Jeff June-9 punch-list **#19** — coach-authored "custom slides" (Esperto's "Verne slide": a branded promo/instructional interstitial inside the assessment).
**Decisions of record:** CONTEXT.md term *Custom slide*; reuses ADR-0001 (stableKey continuity), ADR-0005 (assessment UI brand scope), Wave B sanitizer. No new ADR (unsurprising application of existing patterns).

---

## 1. Summary

A coach authors one or more **branded interstitial slides** on a campaign. Participants see them as
non-question pages woven into the existing **Section pager**. Slides are campaign-scoped, sanitized-HTML,
static (no per-recipient interpolation), and never counted in "Section N of M".

Additive, behind a default-OFF flag `WAVE_M_CUSTOM_SLIDES_ENABLED` (merge dark → flag-flip launch). One
additive nullable column; no destructive migration.

## 2. Decisions of record (from the grill)

| # | Decision |
|---|----------|
| Q1 | **Slides live inside the `SectionPager`**, not before the Welcome screen. "Start" = the first page in the pager (order: Welcome → start slide → Section 1 …). The phase machine (`intro → ready → submitting`) is untouched. |
| Q2 | **Editable in `DRAFT` and `ACTIVE`**, read-only in `CLOSED`. (Slides are content, read at survey-load; editing only affects new loads. Wave-D auto-send flips campaigns to `ACTIVE` fast, so a DRAFT-only rule would make the CampaignDetail editor useless.) Every edit audited. |
| Q3 | **Position model** = `"start"` \| `"before-section:<sectionStableKey>"` \| `"end"`, `sortOrder` breaks ties. Anchored by **stableKey, not index** (ADR-0001). At render, an anchor whose section is absent → slide **dropped + logged** (fail-safe). **"end" = the final page before submission** — its forward button becomes **Submit**. **Post-submit promo is OUT OF SCOPE** (that's the results/thank-you phase). |
| Q4 | **Default-OFF flag** `WAVE_M_CUSTOM_SLIDES_ENABLED` gates the editor **and** slide rendering. |
| — | **Content** = sanitized HTML (chosen in scope question), **no token interpolation** (slides are static promos → zero token-exfil surface). |
| — | **Caps:** ≤10 slides/campaign; ≤20 KB sanitized HTML per slide. |
| — | **Placement: coach-side, per-campaign** (decided 2026-06-30, user). Jeff's #19 says only *"during campaign setup"* — silent on role; campaign setup lives in the coach portal today, and per-campaign authoring lets a coach personalize their own campaign. **Considered + rejected: admin/template-level** (one shared "Verve-slide" promo per assessment, staff-owned) — simpler and arguably closer to the literal "Verve slide" example, but it can't be personalized per campaign, so per-campaign coach authoring won. (A template-level default + coach override is a possible later hybrid.) |
| — | **Authoring v1 = coach wizard (INVITED campaigns only)** + CampaignDetail panel. Renderer is shared, so public-campaign slides are a small future plumb, not v1. |

## 3. Data model (one additive nullable column)

```prisma
model AssessmentCampaign {
  // … existing …
  customSlides  Json?   // CustomSlide[] — null/[] = no slides (default)
}
```

`CustomSlide` (TypeScript shape, validated by Zod on write):

```ts
type SlidePosition =
  | { kind: "start" }
  | { kind: "before-section"; sectionStableKey: string }
  | { kind: "end" };

interface CustomSlide {
  id: string;          // cuid, stable across edits
  title?: string;      // optional heading (plain text, length-capped)
  html: string;        // sanitized HTML body (≤20 KB post-sanitization)
  position: SlidePosition;
  sortOrder: number;   // tiebreak within the same position
}
```

**Rejected alternative:** stuffing slides into the existing unused `publicConfig Json?` — semantically wrong;
additive nullable columns are routine here (Wave D added several). `check-migration-safety.mjs` passes
(additive nullable, no NOT NULL, no drop).

## 4. Rendering (`SectionPager`)

The pager renders a `SectionPage[]` built by `buildSectionPages(sections, questions)`. Today every page is a
section. We extend the page model to a **discriminated union**:

```ts
type PagerPage =
  | { kind: "section"; /* existing SectionPage fields */ }
  | { kind: "slide";   id: string; title?: string; html: string };
```

- A new pure `mergeCustomSlides(pages, slides)` inserts slide pages at `start` / `before-section:<key>` /
  `end`, ordered by `sortOrder`. Anchor not found → drop that slide + log (fail-safe). Runs after
  `buildSectionPages`, before the array reaches `SectionPager`.
- A **slide page** renders inside the existing branded card: optional title → the **re-sanitized** HTML body,
  injected via React's raw-HTML prop on the `sanitizeCustomHtml(html)` output — the same render mechanism Wave
  B's custom-html panel already uses → a single forward button. Back behaves normally; **Back at page 0 →
  `onExit`** (returns to Welcome, as today). A trailing `end` slide's forward button is **Submit**.
- **Progress is section-only:** "Section N of M" and the progress bar count `kind === "section"` pages.
  Precedent: the existing rendered-but-uncounted "Other" page.
- **Shared renderer:** invited (`/org-survey/[alias]`) and public (`/quiz/[alias]`) both use `SectionPager`,
  so both render slides when present. v1 only authors slides on INVITED campaigns, so public payloads carry
  none yet.
- **Autosave untouched** — slides hold no answers; the localStorage autosave keyed to the answers map is
  unaffected by navigating onto/off a slide.
- **Flag-off:** `mergeCustomSlides` is a no-op (slides never injected) and the editor is hidden, so the
  participant flow is byte-for-byte unchanged.

## 5. Authoring UI

One reusable **`CustomSlidesPanel`** (mirrors Wave B's `custom-html-panel.tsx`):

- A list of slides — each with **title**, **HTML body** (textarea), **position picker** (Start / Before
  [section ▾, from the campaign's pinned version] / End), and up/down reorder.
- A **sandboxed-iframe live preview** of the sanitized slide (Wave B pattern), plus the sanitizer's
  **strip-warnings** surfaced inline ("we removed `<script>` …").
- Add / remove / reorder; ≤10 slides enforced client- and server-side.

Mounted in **two places**:
1. **CampaignWizard** — a new optional step **"Custom slides — optional"**, before Review (authors at
   create-time, in `DRAFT`).
2. **CampaignDetail** — the same panel for post-create edits (governed by the `DRAFT`+`ACTIVE` rule, Q2).

## 6. API & data flow

- **Create:** `POST /api/assessment-campaigns` body gains `customSlides?` — server validates (Zod) +
  **sanitizes each `html` on save** + enforces caps + writes audit.
- **Edit:** `PATCH /api/assessment-campaigns/[id]` accepts `customSlides` — `canManageCampaign(actor, id,
  "write")`; rejects on `CLOSED` (409, mirrors the participants-DRAFT pattern but allows `ACTIVE`); sanitize +
  cap + audit (`AssessmentCampaign.customSlides` change recorded in `AuditLog.changes`).
- **Read for survey:** `/org-survey/[alias]/me` (and the public quiz loader) include
  `campaign.customSlides` in the payload so the client can `mergeCustomSlides`.

## 7. Security

- **Sanitize on save AND re-sanitize on render** (defense in depth) via a **stricter, slide-specific
  `sanitizeSlideHtml` profile** — NOT the existing `sanitizeCustomHtml` as-is. **(grill-me correction:**
  `sanitize-custom-html.ts:38` documents itself as an **admin-trusted surface** — it allows `<style>` +
  `<iframe>` and does NOT scheme-validate inline-style `url()`/`@import` — and says *"revisit if it ever
  becomes coach-writable."* Wave M is exactly that.) The slide profile **drops `<style>` and `<iframe>`** and
  strips/scheme-validates inline-style `url()`/`@import` (no CSS bleed/exfil into the survey chrome), while
  keeping `<img>` (https/data), links (https/mailto/tel), and text formatting. A youtube/vimeo video embed is
  a deliberate later add, not v1.
- **No interpolation** → no `{{token}}` exfil surface (unlike the Wave-D invitation HTML, which needed a
  token validator). Slides are static.
- **Caps:** ≤10 slides; ≤20 KB sanitized HTML/slide; title length-capped. Post-sanitization length check
  (matches Wave B).
- **Authz:** `canManageCampaign(…, "write")` on every write; coaches edit only their own campaigns; admin
  bypass.
- **Audit:** every slide write logs to `AuditLog` with the prior `customSlides` snapshot.

## 8. Testing (TDD targets)

- `sanitizeCustomHtml` strips `<script>`/handlers from a slide; warnings surfaced.
- `mergeCustomSlides`: inserts at start / before-section / end in `sortOrder`; missing anchor → dropped+logged;
  empty slides → no-op.
- Progress counter ignores `kind:"slide"` pages; "Section N of M" denominator correct with slides present.
- Back at page 0 → `onExit`; trailing `end` slide forward = Submit.
- PATCH authz: non-owner → 403; `CLOSED` campaign → 409; `ACTIVE` campaign → 200; caps enforced (11th slide /
  oversized html → 400).
- Flag-off: `mergeCustomSlides` no-op + editor hidden → participant flow unchanged (regression test on both
  `/quiz` and `/org-survey`).

## 9. Files to touch

- `src/prisma/schema.prisma` — `customSlides Json?` (+ migration).
- `src/src/lib/assessments/custom-slides.ts` (new) — `CustomSlide` types, Zod schema, `mergeCustomSlides`,
  caps, sanitize-on-save helper.
- `src/src/components/assessments/section-pager.tsx` — page-model union + slide rendering + progress count.
- `src/src/components/assessments/section-pages.ts` — `buildSectionPages` → union; `mergeCustomSlides` wiring.
- `src/src/components/assessments/CustomSlidesPanel.tsx` (new) — editor (wizard step + CampaignDetail).
- `src/src/components/assessments/CampaignWizard.tsx` — new optional step.
- CampaignDetail component — mount the panel (DRAFT+ACTIVE).
- `src/src/app/api/assessment-campaigns/route.ts` + `[id]/route.ts` — accept/validate/sanitize/audit
  `customSlides`.
- `/org-survey/[alias]/me` route (+ public quiz loader) — include `customSlides` in payload.
- `wave-m-flags.ts` (new) — `WAVE_M_CUSTOM_SLIDES_ENABLED` + helper.
- Scoped CSS for the slide page (`.su-assessment-brand` scope, ADR-0005).
- Tests across the above.

## 10. Launch

Merge dark (flag default-OFF). Launch = set `WAVE_M_CUSTOM_SLIDES_ENABLED=1` on Vercel Production +
redeploy, after a prod smoke (author a slide on a test INVITED campaign, confirm it renders as an uncounted
page in `/org-survey`, confirm flag-off control). Kill = zero the flag + redeploy. A short `18m-ops-runbook.md`
ships with the implementation (flag-flip order + smoke + rollback), per house pattern.

## 10.5 grill-me hardening (2026-06-30 — AUTHORITATIVE; supersedes the body where noted)

A second adversarial pass (`/grill-me`, code-grounded) refined four points:

- **GM-3 Sanitizer (supersedes §7):** use a stricter `sanitizeSlideHtml` profile (drop `<style>`/`<iframe>`,
  validate/strip inline-style `url()`/`@import`); the existing `sanitizeCustomHtml` is admin-trusted by its own
  documentation and must not be reused as-is for a coach-writable, participant-facing surface.
- **GM-4 Rendering (refines §4):** slides are array pages but render as **interstitials with NO shell
  header / section counter** — matching the existing non-counted `phaseTile` pattern
  (`section-pager.tsx:47`). `totalSections`/`currentSection` count `kind==="section"` pages only, so the
  counter never sees a slide. Resume is unaffected: `sectionIndex` is local state (starts at 0, not persisted);
  autosave stores answers only. **Mockup correction:** the participant slide must NOT show a "Section N of M"
  strip (the published mockup showed one — to be fixed).
- **GM-5 Ordering & empties:** an `end` slide renders **after** the auto-appended "Other" orphan page
  (`section-pages.ts:40`), so `mergeCustomSlides` appends `end` slides at the very tail. A slide with neither a
  title nor non-empty sanitized HTML is **rejected on save** and skipped at render. The required-answer gate is
  a no-op on a zero-question slide page (code-confirmed) — no special handling.
- **GM-7 Persistence ordering:** `customSlides` are written in the **campaign-create payload** (atomic, at
  `DRAFT` creation) so they exist before activation/immediate-send can make the survey reachable; the
  CampaignDetail `PATCH` (DRAFT+ACTIVE) handles later edits.

## 11. Explicitly out of scope (v1)

- Post-submission ("thank-you") slides — that's the results phase, a different surface.
- Per-recipient token interpolation in slides.
- Authoring slides on PUBLIC campaigns (renderer supports it; no authoring path yet).
- Images uploaded to blob storage from the editor (coaches embed image URLs in the sanitized HTML; an upload
  affordance is a later nicety).
