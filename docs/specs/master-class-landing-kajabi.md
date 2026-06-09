# Spec — Scaling Up Solo-Landing Template (Kajabi-faithful Custom HTML block)

Source root: `src/src`. Reuses TEMPLATE-02 (`feat/template-02-custom-html`, PR #24). Build gate `CI=true npx next build --turbopack`. Sits beside `docs/specs/batch-a-workshop-landing-polish.md` (landing-page domain) — NOT `docs/specs/v7.6/*` (assessment domain). Implementation plan: [`master-class-landing-kajabi-implementation-plan.md`](./master-class-landing-kajabi-implementation-plan.md).

> **Scope was sharpened by a `/grill-with-docs` pass (2026-06-09).** Jeff's "master class landing page" is served by the **global** `SOLO_LANDING` template (one row, every single-coach workshop) — so this is **the new global Scaling Up solo-landing look**, with **generic, format-neutral copy** (not the one-off exit-specific clone the first draft contained). See §2.

## 1. Context — Jeff's ask
Jeff (June 8 Slack): *"get the master class landing page to look as close to this the kajabi page as you can … I want to generate new code that looks more like this page … please help me generate the code."* Reference target captured live from `scalingupus.mykajabi.com/...claire-mula`: white editorial single-column, Fira Sans 700 headings / Open Sans body, the Four-Decisions four-color hero banner, a coach card, About / What's-Included / Why-Attend sections, a callout, a price + "Register Here" block, and a footer. The platform already supports this via TEMPLATE-02: an admin pastes BODY-HTML-only into the **Custom HTML** field on a SOLO_LANDING / DUO_LANDING `PageTemplate`; tokens are substituted at workshop-approval/build time and the stored (sanitized) string is echoed by the render path. This spec defines the **production-ready HTML artifact** (Appendix A) plus guard tests — it is an HTML deliverable, not a code-architecture change. Direction-mockup approved by the user (Gabriel) on June 8; scope grilled June 9.

(Jeff's queued #2, "the scaling up quick assessment is the next one i want to see" — a separate, assessment-domain ask — is **parked** pending confirmation of *which* assessment he means; our templates are Rockefeller Habits Checklist / Quarterly Session Prep v1·v2 / Leadership Vision Alignment / Scaling Up Full, none literally a "Quick Assessment," and all already render in the branded quiz + report from PR #41. Out of scope here.)

## 2. Scope & propagation (grilled)
- **`SOLO_LANDING` is ONE global `PageTemplate`** keyed by `templateType` (+ optional `categoryId`); it has **no `workshopId`**. `auto-build-service.ts:93-119` fetches the active SOLO_LANDING row for *every* single-coach workshop. **So this block is the global solo-landing design** — copy must be generic + format-neutral (§7).
- **`LandingPage` is a per-workshop snapshot** (`@@unique([workshopId, template])`). `runAutoBuild` copies `PageTemplate.customHtml` → `LandingPage.customHtml` **once, at `workshop/approved`** (idempotency-guarded). Editing the template therefore only affects workshops approved **afterward**.
- **Existing pages (incl. the Martin Segnitz page Jeff is looking at) are updated via backfill, NOT rebuild.** Decision: **update the global template + backfill ALL existing solo pages.** Reuse the guarded `scripts/backfill-solo-landing-customhtml.ts` (June-4 precedent): per-workshop re-interpolation of the current `PageTemplate.customHtml` (`buildWorkshopVariables` → enrichedVars/registration_url two-pass → `interpolateContentForHtml` → strict `sanitizeCustomHtml`), `--dry-run` default → `--apply`, JSON backup, compare-and-swap on `updatedAt`, prod guard (`--i-know-this-is-prod`), reversible via `--restore`. It deliberately avoids `runAutoBuild` (no re-sent "Workshop Ready" emails, no workflow reassignment, no status flip).
- **Propagation is a guarded, canary-first migration** (hardened by claudex review `20260609-043741-0904d9`, see the implementation plan). Critically: target rows by `sourceTemplateId` + a **per-workshop re-render of the OLD template** (the interpolated `LandingPage.customHtml` never equals the raw template hash, so a raw-hash gate would skip every row — claudex R2/R3-High1); the prod template update + backfill run as **dedicated CAS-guarded, audited scripts** (the admin PATCH route is not CAS-guarded); CTA/registration + price preflights must pass; canary one slug → cohort → full; reversible via per-row + template restore.

## 3. Verified token contract
Interpolation is **pure string replace, no conditionals** (`interpolate-content-html.ts`: `out.split('{{key}}').join(escaped)` + the spaced `{{ key }}` form). Every value is **HTML-escaped** (`escapeHtml`) and null/undefined → `""`. Use the exact double-brace spelling (no inner spaces). Tokens used by this block (all verified in `buildWorkshopVariables`, `template-interpolation.ts`):

| Slot | Token | Source / note |
|------|-------|----------------|
| Hero title (h1) + intro + buybar + footer | `{{workshop_title}}` | `workshop.title` |
| **About body (per-workshop)** | `{{workshop_description}}` | `workshop.description \|\| ""` — **can be empty** (a generic lead sentence precedes it, so an empty value just yields no extra paragraph) |
| Hero meta — full date | `{{event_date}}` | weekday + full date ("Thursday, June 18, 2026") |
| Buybar + footer — terse date | `{{event_date_no_weekday}}` | "June 18, 2026" |
| Hero meta — time | `{{event_time}}` | DST-zoned ("9:00 AM EDT") |
| Coach name | `{{coach_name}}` | "First Last" |
| Coach title | `{{coach_title}}` | `coach.title` → `coach.company` → "Scaling Up Certified Coach" |
| Coach photo `<img src>` | `{{coach_photo}}` | `coach.profileImage \|\| ""` — **can be empty**. Use an `<img src>` (sanitizer validates src URLs + strict build-time re-sanitize). **Do NOT** put the token in a CSS `background-image:url('…')` — `style`/`url()` is passed through UNPARSED, so a dynamic token there is a CSS-injection vector (claudex R2-High2). Empty-photo is prevented from shipping by the backfill preflight (require a non-empty photo) + a template-level default-avatar, not by markup tricks. |
| Price | `{{price}}` | "$NNN" / "Free" / "TBD" — never empty, bare-USD (no currency code/cents) |
| Register CTA `href` | `{{registration_url}}` | seeded Pass 2 by `runAutoBuild`; `""` if no REGISTRATION template |

**Tokens that do NOT exist (so handled as fixed template copy or omitted):** no `video`/`video_url` (video section **omitted** in v1, §8), no `partner`/partner-logo (a generic text line), no short-tagline, no coach-initials, no friendly-format-label (`{{workshop_format}}` is the raw enum, so the hero's third meta line is the neutral fixed label "Scaling Up Workshop").

## 4. Sanitizer / CSP / font-loading facts (verified empirically against the real `sanitize-html` config)
- **Allowed tags:** sanitize-html defaults + `img, style, iframe, section, article, header, footer, main, nav, aside, figure, figcaption`. **Stripped:** all inline SVG (`svg/path/rect/circle/…`) and `<link>` (proven: `HAS svg: false`).
- **`<style>` content is preserved verbatim** (`allowVulnerableTags:true`): `@import`, `var()`, `aspect-ratio`, grid/flex, `@media`, `::before/::after` all survive (proven: `HAS @import: true`). Inline `style=""` passes through un-normalized (`parseStyleAttributes:false`).
- **Fonts MUST load via `@import` as the FIRST line inside `<style>`** — not `<link>`. CSP (`vercel.json`) allows it: `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`; `font-src 'self' https://fonts.gstatic.com`.
- **Token URIs survive save-time** in `href`/`src` (`allowTokenUris=true`, `TOKEN_RE`); the build-time strict re-sanitize (`allowTokenUris=false`) keeps the interpolated absolute https URL and strips any `javascript:`/non-allowlisted result.
- **Icons:** inline SVG is unsupported → CSS-drawn glyphs (`::before/::after`). This block uses them for the three hero-meta icons.
- **Video (when re-added):** `<iframe>` allowed only for `FRAME_SRC_ALLOWLIST` hosts (Stripe, `player.vimeo.com`, `youtube(-nocookie).com`); `srcdoc` always deleted.
- **Render:** `workshop/[slug]/page.tsx` echoes the stored sanitized+interpolated string into a plain `<div data-custom-html-render>` via React's HTML-injection prop — **no shadow DOM, no re-sanitize at render, no scoping** (so the block must self-scope: §5).

## 5. Scoping (ADR-0005 principle — no global leak)
The render `<div>` has no scoping, so a bare selector in the injected `<style>` leaks page-wide. **Rule:** every selector MUST be prefixed `.su-mc`; the root carries `class="su-mc"`. No bare `body{}/html{}/*{}/h1{}/a{}`. `background:#fff` lives on `.su-mc` itself; no preview-only `body{}` ships.

## 6. Section structure (top → bottom)
Hero card (four-color stripe → dark left panel: SCALING UP wordmark, **h1 = `{{workshop_title}}`**, generic tagline "Growing Leaders. Growing Companies.", three CSS-icon meta rows [`{{event_date}}` / `{{event_time}}` / "Scaling Up Workshop"]; white right panel: SU Coaches wordmark, coach photo, name, title, "In Partnership With Scaling Up") → intro ("Join us for" + the quoted `{{workshop_title}}`) → generic centered lead paragraph → **About the Workshop** (h2: generic lead + `{{workshop_description}}`) → **What's Included** (h2, 4 ticks) → **Why Attend?** (h2, 5 ticks, Four-Decisions framing) → centered "Secure your seat / Spots are limited" callout → price + "Register Here" buybar → dark footer. **No video section in v1.**

## 7. Copy model (generic + format-neutral)
Because the template is global (virtual AND in-person, exit AND non-exit single-coach workshops):
- **Per-workshop (tokens):** workshop title, About body (`{{workshop_description}}`), event date (full + terse), event time, coach name, coach title, coach photo, price, registration URL.
- **Fixed generic template copy:** hero tagline, "Join us for", the generic lead sentence, About lead sentence (names Verne Harnish generically as the Scaling Up methodology author — not exit-specific), What's-Included bullets (format-neutral: "workbook and session materials", "frameworks you can apply", "live Q&A", "connection with fellow leaders" — **no lunch/take-home**), Why-Attend bullets (People/Strategy/Execution/Cash), the callout, "In Partnership With Scaling Up", the SCALING UP wordmarks. Editable in place to spin a category-scoped variant later if wanted.

## 8. Fidelity decisions (grilled)
- **CTA stays Kajabi blue `#0072EF`** (Jeff's "match Kajabi" ask). Swapping to SU purple `#522583` is a one-variable change (`--cta`/`--cta-hover`).
- **Type/color match Kajabi:** headings Fira Sans 700 `#161E2A`; body Open Sans `#595959`.
- **Video omitted in v1** — no per-workshop video token and no real Scaling Up asset; shipping a demo clip globally is worse than none. Re-add as a one-block change when Jeff supplies a Vimeo/YouTube URL (the only allowlisted hosts). The `.video` CSS rule is retained (commented intent) for trivial re-add.
- **Price = bare USD** ("$349"); cannot reproduce Kajabi's "$445.00 AUD" (no currency field). Accepted for v1; flagged to Jeff.
- **Partner line = generic text** ("In Partnership With Scaling Up"); real partner logos (e.g. Cornerstone/STS) would need a per-template image slot — deferred.

## 9. Accessibility
Single `<h1>` first in source order (the title); no skipped levels (h1 → h2). Coach `<img>` has `alt="{{coach_name}}"` and a purple background fallback for empty src. CTA is a real `<a href>` with discernible text. Decorative CSS icons are `aria-hidden="true"`. Muted greys use `--muted:#6b6b6b` (≥4.5:1 on white) — fixes the prior `#8a8a8a`/`#b0b0b0` AA failures.

## 10. Responsive
Breakpoint `@media(max-width:760px)`: hero collapses 2-col → 1-col; hero title 40→30px; intro 34→26px. Containers `max-width` + `margin:0 auto` + `padding:0 24px` (hero 1040, wrap 920, buybar 620, btn max 420). 138px photo fits narrow viewports.

## 11. Open / follow-on (genuinely for Jeff or later)
- **Real video asset** → re-add the embed.
- **Multi-currency pricing** → per-workshop currency field + `{{price}}` formatter.
- **Real partner logos** → per-template image slot.
- **DUO_LANDING (two-coach)** variant → second coach card + two-photo hero; same pipeline; deferred.
- **Category-scoped variant** → if a specific workshop family ever needs bespoke (e.g. exit-specific) copy, attach a `categoryId`-scoped SOLO_LANDING template; the global one stays generic.
- **Jeff's #2 (quick assessment)** → parked pending which-assessment confirmation.

## Appendix A — the pasteable Custom HTML block (production, tokenized, generic)
Paste exactly this `<div>` (and nothing above/below it) into the SOLO_LANDING template's **Custom HTML** field. The `@import` must remain the first line inside `<style>`. Fixed copy is edited in place per template.

```html
<div class="su-mc" data-su-mc>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,600;0,700;1,400&family=Fira+Sans:ital,wght@0,400;0,500;0,600;0,700;1,700&display=swap');

  .su-mc{--ink:#161E2A;--body:#595959;--muted:#6b6b6b;--cta:#0072EF;--cta-hover:#005fce;
    --su-purple:#522583;--c-people:#f7a600;--c-strategy:#008bd2;--c-exec:#946b36;--c-cash:#95c11f;
    font-family:"Open Sans",Helvetica,Arial,sans-serif;color:var(--body);line-height:1.65;font-size:17px;-webkit-font-smoothing:antialiased;background:#fff;}
  .su-mc *{box-sizing:border-box;}
  .su-mc h1,.su-mc h2,.su-mc h3,.su-mc h4{font-family:"Fira Sans","Open Sans",Helvetica,Arial,sans-serif;color:var(--ink);font-weight:700;line-height:1.2;}
  .su-mc .wrap{max-width:920px;margin:0 auto;padding:0 24px;}
  .su-mc a{color:var(--cta);}

  /* ---------- HERO BANNER (CSS rebuild of the Kajabi graphic) ---------- */
  .su-mc .hero{max-width:1040px;margin:32px auto 0;padding:0 24px;}
  .su-mc .hero-card{border-radius:10px;overflow:hidden;box-shadow:0 18px 50px rgba(22,30,42,.18);
    display:grid;grid-template-columns:1.55fr 1fr;}
  .su-mc .hero-stripe{height:10px;grid-column:1 / -1;display:flex;}
  .su-mc .hero-stripe span{flex:1;}
  .su-mc .hero-left{position:relative;background:#0b0b0d;color:#fff;padding:42px 40px 38px;overflow:hidden;}
  .su-mc .hero-left::before{content:"";position:absolute;right:-60px;top:-40px;width:280px;height:320px;
    background:linear-gradient(135deg,#6a2fae 0%,#3d1668 70%);transform:skewX(-14deg);opacity:.55;}
  .su-mc .hero-logo{position:relative;font-family:"Fira Sans",Helvetica,Arial,sans-serif;font-weight:700;letter-spacing:.06em;font-size:15px;color:#fff;margin-bottom:34px;}
  .su-mc .hero-logo b{display:inline-block;width:13px;height:13px;background:var(--c-cash);margin-left:6px;vertical-align:middle;}
  .su-mc h1.hero-title{position:relative;font-size:40px;line-height:1.04;margin:0 0 6px;color:#fff;text-transform:uppercase;letter-spacing:.01em;}
  .su-mc .hero-tag{position:relative;color:var(--c-people);font-weight:700;font-size:16px;margin:14px 0 24px;}
  .su-mc .hero-meta{position:relative;display:flex;flex-direction:column;gap:9px;font-size:14px;color:#e8e8ea;}
  .su-mc .hero-meta div{display:flex;align-items:center;gap:10px;}
  .su-mc .hero-meta .ico{flex:none;display:inline-block;width:16px;height:16px;position:relative;}
  /* CSS-drawn icons (inline SVG is stripped by the sanitizer) */
  .su-mc .ico-cal::before{content:"";position:absolute;inset:1px 0 0;border:2px solid var(--c-people);border-radius:3px;}
  .su-mc .ico-cal::after{content:"";position:absolute;top:-1px;left:3px;right:3px;height:3px;border-left:2px solid var(--c-people);border-right:2px solid var(--c-people);}
  .su-mc .ico-clock::before{content:"";position:absolute;inset:1px;border:2px solid var(--c-people);border-radius:50%;}
  .su-mc .ico-clock::after{content:"";position:absolute;left:7px;top:4px;width:2px;height:5px;background:var(--c-people);box-shadow:1px 4px 0 -1px var(--c-people);}
  .su-mc .ico-pin::before{content:"";position:absolute;left:2px;top:0;width:12px;height:12px;border:2px solid var(--c-people);border-radius:50% 50% 50% 0;transform:rotate(-45deg);}
  .su-mc .hero-right{background:#fff;padding:26px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;}
  .su-mc .hero-right .coachlogo{font-family:"Fira Sans",Helvetica,Arial,sans-serif;font-weight:700;font-size:12px;letter-spacing:.04em;color:var(--ink);margin-bottom:14px;}
  .su-mc .hero-right .coachlogo span{display:block;font-size:9px;letter-spacing:.22em;color:var(--muted);font-weight:600;}
  .su-mc .hero-photo{width:138px;height:138px;border-radius:50%;object-fit:cover;border:4px solid var(--su-purple);background:var(--su-purple);display:block;}
  .su-mc .hero-right .cname{font-family:"Fira Sans",Helvetica,Arial,sans-serif;font-weight:700;color:var(--ink);font-size:20px;margin:14px 0 2px;}
  .su-mc .hero-right .ctitle{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);}
  .su-mc .hero-right .partner{margin-top:18px;padding-top:14px;border-top:1px solid #ececec;font-size:11px;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;}

  /* ---------- INTRO ---------- */
  .su-mc .intro{text-align:center;padding:54px 24px 10px;}
  .su-mc .intro .pre{font-size:26px;font-weight:400;font-family:"Fira Sans",Helvetica,Arial,sans-serif;color:var(--ink);}
  .su-mc .intro .intro-title{font-family:"Fira Sans",Helvetica,Arial,sans-serif;font-weight:700;color:var(--ink);font-size:34px;margin:6px 0 0;line-height:1.2;}

  /* ---------- CONTENT ---------- */
  .su-mc section{padding:30px 0;}
  .su-mc section h2{font-size:28px;margin:0 0 14px;}
  .su-mc p{margin:0 0 16px;}
  .su-mc .lead b{color:var(--ink);}
  .su-mc ul.ticks{list-style:none;padding:0;margin:0;}
  .su-mc ul.ticks li{position:relative;padding:8px 0 8px 34px;border-bottom:1px solid #f0f0f0;}
  .su-mc ul.ticks li::before{content:"";position:absolute;left:0;top:13px;width:18px;height:18px;border-radius:50%;
    background:var(--c-cash);}
  .su-mc ul.ticks li::after{content:"";position:absolute;left:6px;top:17px;width:5px;height:9px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg);}

  .su-mc .callout{background:#f6f7f9;border-left:4px solid var(--su-purple);border-radius:6px;padding:26px 30px;text-align:center;margin:18px 0;}
  .su-mc .callout strong{color:var(--ink);font-family:"Fira Sans",Helvetica,Arial,sans-serif;font-size:18px;}

  /* ---------- VIDEO (omitted in v1 — re-add a .video block with a Vimeo/YouTube iframe when a real asset exists) ---------- */
  .su-mc .video{max-width:760px;margin:30px auto;border-radius:10px;overflow:hidden;box-shadow:0 14px 40px rgba(22,30,42,.16);position:relative;background:#000;aspect-ratio:16/9;}
  .su-mc .video iframe{position:absolute;inset:0;width:100%;height:100%;border:0;}

  /* ---------- PRICE / REGISTER CARD ---------- */
  .su-mc .buybar{max-width:620px;margin:34px auto 60px;border:1px solid #e7e7ea;border-radius:12px;overflow:hidden;box-shadow:0 12px 36px rgba(22,30,42,.10);}
  .su-mc .buybar .thumb{height:8px;display:flex;}
  .su-mc .buybar .thumb span{flex:1;}
  .su-mc .buybar .bbody{padding:24px 28px;text-align:center;}
  .su-mc .buybar h3{font-size:20px;margin:0 0 6px;}
  .su-mc .buybar .price{font-family:"Fira Sans",Helvetica,Arial,sans-serif;font-weight:700;color:var(--ink);font-size:30px;margin:8px 0 18px;}
  .su-mc .btn{display:inline-block;background:var(--cta);color:#fff;font-family:"Open Sans",Helvetica,Arial,sans-serif;font-weight:700;font-size:18px;
    padding:13px 44px;border-radius:4px;text-decoration:none;width:100%;max-width:420px;}
  .su-mc .btn:hover{background:var(--cta-hover);}

  /* ---------- FOOTER ---------- */
  .su-mc .foot{background:#0b0b0d;color:#bcbcc2;text-align:center;padding:34px 24px;font-size:13px;}
  .su-mc .foot .flogo{font-family:"Fira Sans",Helvetica,Arial,sans-serif;font-weight:700;color:#fff;letter-spacing:.06em;font-size:15px;margin-bottom:8px;}

  @media(max-width:760px){
    .su-mc .hero-card{grid-template-columns:1fr;}
    .su-mc h1.hero-title{font-size:30px;}
    .su-mc .intro .pre{font-size:22px;}
    .su-mc .intro .intro-title{font-size:26px;}
  }
</style>

<!-- HERO -->
<div class="hero">
  <div class="hero-card">
    <div class="hero-stripe">
      <span style="background:var(--c-people)"></span>
      <span style="background:var(--c-strategy)"></span>
      <span style="background:var(--c-exec)"></span>
      <span style="background:var(--c-cash)"></span>
    </div>
    <div class="hero-left">
      <div class="hero-logo">SCALING UP<b></b></div>
      <h1 class="hero-title">{{workshop_title}}</h1>
      <div class="hero-tag">Growing Leaders. Growing Companies.</div>
      <div class="hero-meta">
        <div><span class="ico ico-cal" aria-hidden="true"></span> {{event_date}}</div>
        <div><span class="ico ico-clock" aria-hidden="true"></span> {{event_time}}</div>
        <div><span class="ico ico-pin" aria-hidden="true"></span> Scaling Up Workshop</div>
      </div>
    </div>
    <div class="hero-right">
      <div class="coachlogo">SCALING UP<span>COACHES</span></div>
      <img class="hero-photo" src="{{coach_photo}}" alt="{{coach_name}}" width="138" height="138">
      <div class="cname">{{coach_name}}</div>
      <div class="ctitle">{{coach_title}}</div>
      <div class="partner">In Partnership With Scaling Up</div>
    </div>
  </div>
</div>

<!-- INTRO -->
<div class="intro">
  <div class="pre">Join us for</div>
  <div class="intro-title">&ldquo;{{workshop_title}}&rdquo;</div>
</div>

<div class="wrap">
  <p class="lead" style="text-align:center;max-width:720px;margin:0 auto 10px;">Scaling Up workshops give business leaders the proven tools and frameworks to align their team, sharpen strategy, drive execution, and accelerate growth &mdash; the same methodology used by tens of thousands of companies worldwide.</p>

  <section>
    <h2>About the Workshop</h2>
    <p>This session is led by <b>{{coach_name}}</b>, a Scaling Up Certified Coach, and draws on the proven Scaling Up methodology developed by <b>Verne Harnish</b> and used by growth companies around the world.</p>
    <p>{{workshop_description}}</p>
  </section>

  <section>
    <h2>What&rsquo;s Included</h2>
    <ul class="ticks">
      <li>The Scaling Up workbook and session materials</li>
      <li>Proven frameworks and tools you can apply immediately</li>
      <li>Live Q&amp;A with your Scaling Up Certified Coach</li>
      <li>Connection with fellow business leaders</li>
    </ul>
  </section>

  <section>
    <h2>Why Attend?</h2>
    <ul class="ticks">
      <li>Align your leadership team and get the right people in the right seats</li>
      <li>Sharpen a strategy that sets your business apart</li>
      <li>Build the execution rhythm that turns plans into results</li>
      <li>Strengthen the cash flow that fuels sustainable growth</li>
      <li>Leave with a clear action plan you can put to work right away</li>
    </ul>
  </section>

  <div class="callout">
    <strong>Secure your seat today.</strong><br>
    Take the next step toward building a stronger, faster-growing business &mdash; on your terms. <em>Spots are limited.</em>
  </div>

  <div class="buybar">
    <div class="thumb">
      <span style="background:var(--c-people)"></span><span style="background:var(--c-strategy)"></span><span style="background:var(--c-exec)"></span><span style="background:var(--c-cash)"></span>
    </div>
    <div class="bbody">
      <h3>{{event_date_no_weekday}} &middot; {{workshop_title}} with {{coach_name}}</h3>
      <div class="price">{{price}}</div>
      <a class="btn" href="{{registration_url}}">Register Here</a>
    </div>
  </div>
</div>

<div class="foot">
  <div class="flogo">SCALING UP</div>
  Growing Leaders &middot; Growing Companies &mdash; {{workshop_title}}, {{event_date_no_weekday}}
</div>

</div>
```
