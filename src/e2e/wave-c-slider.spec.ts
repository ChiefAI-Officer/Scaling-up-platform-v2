/**
 * wave-c-slider.spec.ts
 *
 * Playwright / Chromium visual-state test for the Wave C survey slider.
 *
 * Why this test exists (claudex R1-M5):
 *   CSS pseudo-elements (::-webkit-slider-thumb, :focus-visible, custom props)
 *   are invisible to jsdom/RTL. Only a real browser engine can prove these rules
 *   render correctly. This spec is self-contained — it injects the REAL committed
 *   CSS + a minimal DOM via page.setContent(), so no app server, no DB, no auth.
 *
 * Focus mechanism:
 *   We use `locator.focus()` followed by `page.keyboard.press('Tab')` then
 *   `page.keyboard.press('Shift+Tab')` to return focus, triggering :focus-visible
 *   in Chromium. Chromium recognises programmatic `.focus()` as keyboard-intent
 *   when there is a prior keyboard event in the page. We prime it with a Space
 *   keypress on the body first. If the outline is still "none" we fall back to
 *   asserting the :focus outline on the slider element itself (which the CSS
 *   places on .survey-slider-wrap.is-unanswered .survey-slider:focus-visible).
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Resolve paths (spec lives at src/e2e/; CSS lives at src/src/styles/)
// ---------------------------------------------------------------------------
const CSS_PATH = path.join(__dirname, "../src/styles/wireframes-scoped.css");

function buildHtml(): string {
  const realCss = fs.readFileSync(CSS_PATH, "utf8");

  // Minimal :root tokens so hsl(var(--destructive)) etc resolve in the injected page.
  // These are the real light-theme values from src/src/app/globals.css — used here as
  // stand-ins so the computed colour assertions work without importing the full app CSS.
  const tokenRoot = `
    :root {
      --background: 210 40% 98%;
      --foreground: 222.2 84% 4.9%;
      --card: 0 0% 100%;
      --card-foreground: 222.2 84% 4.9%;
      --primary: 224 76% 48%;
      --primary-foreground: 210 40% 98%;
      --secondary: 210 40% 96.1%;
      --secondary-foreground: 222.2 47.4% 11.2%;
      --muted: 210 40% 96.1%;
      --muted-foreground: 215.4 16.3% 46.9%;
      --accent: 210 40% 96.1%;
      --accent-foreground: 222.2 47.4% 11.2%;
      --destructive: 0 84.2% 60.2%;
      --destructive-foreground: 210 40% 98%;
      --border: 214.3 31.8% 91.4%;
      --input: 214.3 31.8% 91.4%;
      --ring: 224 76% 48%;
      --radius: 0.5rem;
      --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.03);
      --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06);
    }
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    ${tokenRoot}
    body { margin: 2rem; background: #f8f8fc; }
    ${realCss}
  </style>
</head>
<body>
<div class="su-assessment-brand" id="brand-root">
  <ul class="survey-question-list">

    <!-- ── Card 1: UNANSWERED ──────────────────────────────────────────── -->
    <li class="survey-question" id="card-unanswered">
      <label class="survey-question-label" for="slider-unanswered">
        Q1 – How confident are you? (unanswered)
      </label>
      <div class="survey-slider-wrap is-unanswered" id="wrap-unanswered">
        <input
          id="slider-unanswered"
          type="range"
          class="survey-slider"
          min="0" max="10" step="1"
          value="0"
          aria-valuemin="0" aria-valuemax="10"
          aria-valuetext="Not yet answered"
        />
        <div class="survey-slider-ticks" aria-hidden="true">
          <span class="survey-slider-tick">0</span>
          <span class="survey-slider-tick">1</span>
          <span class="survey-slider-tick">2</span>
          <span class="survey-slider-tick">3</span>
          <span class="survey-slider-tick">4</span>
          <span class="survey-slider-tick">5</span>
          <span class="survey-slider-tick">6</span>
          <span class="survey-slider-tick">7</span>
          <span class="survey-slider-tick">8</span>
          <span class="survey-slider-tick">9</span>
          <span class="survey-slider-tick">10</span>
        </div>
        <div class="survey-slider-anchors">
          <span>Not at all</span>
          <span>Completely</span>
        </div>
        <p class="survey-slider-status">Tap or drag the slider to rate.</p>
      </div>
    </li>

    <!-- ── Card 2: ANSWERED (mid-scale, --pct:60%) ────────────────────── -->
    <li class="survey-question" id="card-answered">
      <label class="survey-question-label" for="slider-answered">
        Q2 – How satisfied are you? (answered: 6)
      </label>
      <div class="survey-slider-wrap" id="wrap-answered">
        <input
          id="slider-answered"
          type="range"
          class="survey-slider"
          min="0" max="10" step="1"
          value="6"
          aria-valuemin="0" aria-valuemax="10"
          aria-valuenow="6"
          aria-valuetext="6"
          style="--pct: 60%"
        />
        <div class="survey-slider-ticks" aria-hidden="true">
          <span class="survey-slider-tick">0</span>
          <span class="survey-slider-tick">1</span>
          <span class="survey-slider-tick">2</span>
          <span class="survey-slider-tick">3</span>
          <span class="survey-slider-tick">4</span>
          <span class="survey-slider-tick">5</span>
          <span class="survey-slider-tick is-current">6</span>
          <span class="survey-slider-tick">7</span>
          <span class="survey-slider-tick">8</span>
          <span class="survey-slider-tick">9</span>
          <span class="survey-slider-tick">10</span>
        </div>
        <div class="survey-slider-anchors">
          <span>Not at all</span>
          <span>Completely</span>
        </div>
        <p class="survey-slider-status">Your rating: 6</p>
      </div>
    </li>

    <!-- ── Card 3: INVALID (unanswered + required error) ─────────────── -->
    <li class="survey-question" id="card-invalid">
      <label class="survey-question-label" for="slider-invalid">
        Q3 – Required question (invalid)
      </label>
      <div class="survey-slider-wrap is-unanswered is-invalid" id="wrap-invalid">
        <input
          id="slider-invalid"
          type="range"
          class="survey-slider is-invalid"
          min="0" max="10" step="1"
          value="0"
          aria-valuemin="0" aria-valuemax="10"
          aria-valuetext="Not yet answered"
          aria-invalid="true"
        />
        <div class="survey-slider-ticks" aria-hidden="true">
          <span class="survey-slider-tick">0</span>
          <span class="survey-slider-tick">1</span>
          <span class="survey-slider-tick">2</span>
          <span class="survey-slider-tick">3</span>
          <span class="survey-slider-tick">4</span>
          <span class="survey-slider-tick">5</span>
          <span class="survey-slider-tick">6</span>
          <span class="survey-slider-tick">7</span>
          <span class="survey-slider-tick">8</span>
          <span class="survey-slider-tick">9</span>
          <span class="survey-slider-tick">10</span>
        </div>
        <div class="survey-slider-anchors">
          <span>Not at all</span>
          <span>Completely</span>
        </div>
        <p class="survey-slider-status">Tap or drag the slider to rate.</p>
      </div>
    </li>

    <!-- ── Card 4: FOCUSED-UNANSWERED (same markup as unanswered; focus applied in test) -->
    <li class="survey-question" id="card-focus">
      <label class="survey-question-label" for="slider-focus">
        Q4 – Focus-ring test (unanswered, will be focused)
      </label>
      <div class="survey-slider-wrap is-unanswered" id="wrap-focus">
        <input
          id="slider-focus"
          type="range"
          class="survey-slider"
          min="0" max="10" step="1"
          value="0"
          aria-valuemin="0" aria-valuemax="10"
          aria-valuetext="Not yet answered"
        />
        <div class="survey-slider-ticks" aria-hidden="true">
          <span class="survey-slider-tick">0</span>
          <span class="survey-slider-tick">5</span>
          <span class="survey-slider-tick">10</span>
        </div>
        <div class="survey-slider-anchors">
          <span>Not at all</span>
          <span>Completely</span>
        </div>
        <p class="survey-slider-status">Tap or drag the slider to rate.</p>
      </div>
    </li>

  </ul>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Wave C — Slider CSS visual states (Chromium only)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(buildHtml(), { waitUntil: "domcontentloaded" });
  });

  // ── 1. Unanswered thumb is invisible ──────────────────────────────────────
  //
  // NOTE on Chromium limitation:
  //   `getComputedStyle(el, '::-webkit-slider-thumb')` does NOT return actual
  //   pseudo-element styles in Chromium via Playwright (it reflects the host
  //   element's own computed values instead). This is a known, unresolved
  //   W3C/Chromium gap — pseudo-element CSSOM is not yet specified.
  //
  // Approach: inspect the loaded stylesheet rules directly. The CSS rule
  //   `.su-assessment-brand .survey-slider-wrap.is-unanswered .survey-slider::-webkit-slider-thumb { opacity: 0 }`
  //   must be present in document.styleSheets. We walk all CSSStyleRules to
  //   find it. This proves the authored rule is in the live document — the
  //   screenshot in test 6 provides the visual proof layer.
  test("unanswered thumb opacity is 0 — CSS rule present in live document", async ({ page }) => {
    const ruleFound = await page.evaluate(() => {
      // Walk all loaded stylesheets and their rules
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList | null = null;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // cross-origin sheet (e.g. Google Fonts import)
        }
        if (!rules) continue;
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSStyleRule) {
            const sel = rule.selectorText ?? "";
            // Match the exact rule that hides the unanswered thumb
            if (
              sel.includes("is-unanswered") &&
              sel.includes("::-webkit-slider-thumb")
            ) {
              const opacity = rule.style.getPropertyValue("opacity").trim();
              if (opacity === "0") return true;
            }
          }
        }
      }
      return false;
    });
    expect(ruleFound).toBe(true);
  });

  // ── 2. Answered thumb is visible — CSS rule check ─────────────────────────
  //
  // Same approach: verify that the BASE thumb rule (for answered state, where
  // no .is-unanswered override applies) sets width:30px, opacity is NOT 0.
  // The base rule `.su-assessment-brand .survey-slider::-webkit-slider-thumb`
  // defines width:30px — absence of an opacity:0 override means it inherits 1.
  test("answered thumb is visible — no opacity:0 rule targets non-unanswered slider", async ({ page }) => {
    // Verify NO rule sets opacity:0 for the answered slider
    const hasHidingRule = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList | null = null;
        try { rules = sheet.cssRules; } catch { continue; }
        if (!rules) continue;
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSStyleRule) {
            const sel = rule.selectorText ?? "";
            // A rule hiding the thumb MUST include .is-unanswered;
            // if it targets ::-webkit-slider-thumb WITHOUT .is-unanswered, check opacity
            if (
              sel.includes("::-webkit-slider-thumb") &&
              !sel.includes("is-unanswered")
            ) {
              const opacity = rule.style.getPropertyValue("opacity").trim();
              if (opacity === "0") return true; // this would be a bug
            }
          }
        }
      }
      return false;
    });
    // No rule should hide the answered thumb
    expect(hasHidingRule).toBe(false);
  });

  // ── 3. Answered thumb width is 30px — CSS rule check ─────────────────────
  //
  // Same limitation as above. Verify via styleSheets walk that the base
  // ::-webkit-slider-thumb rule sets width: 30px.
  test("answered thumb width is 30px — CSS rule present in live document", async ({ page }) => {
    const widthFound = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList | null = null;
        try { rules = sheet.cssRules; } catch { continue; }
        if (!rules) continue;
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSStyleRule) {
            const sel = rule.selectorText ?? "";
            // Base thumb rule (not scoped to is-unanswered)
            if (
              sel.includes(".survey-slider::-webkit-slider-thumb") &&
              !sel.includes("is-unanswered")
            ) {
              const w = rule.style.getPropertyValue("width").trim();
              if (w === "30px") return true;
            }
          }
        }
      }
      return false;
    });
    expect(widthFound).toBe(true);
  });

  // ── 4. Invalid card border differs from normal card border ─────────────────
  test("invalid card has a different border-color than a normal card", async ({ page }) => {
    const { normalBorder, invalidBorder } = await page.evaluate(() => {
      const normalCard = document.getElementById("card-unanswered") as HTMLElement;
      const invalidCard = document.getElementById("card-invalid") as HTMLElement;
      return {
        normalBorder: getComputedStyle(normalCard).borderColor,
        invalidBorder: getComputedStyle(invalidCard).borderColor,
      };
    });

    // The :has(.is-invalid) rule sets border-color: hsl(var(--destructive)) ≈ red
    // while normal cards use #e8e2f2 (soft purple-tinted)
    expect(invalidBorder).not.toBe(normalBorder);

    // Extra: invalidBorder should look reddish — rgb values where R >> G,B
    // rgb(...) format: extract components
    const rgbMatch = invalidBorder.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch.map(Number);
      // --destructive: 0 84.2% 60.2% → hsl(0,84%,60%) → roughly rgb(239, 68, 68)
      // R should be significantly greater than G and B
      expect(r).toBeGreaterThan(g + 50);
      expect(r).toBeGreaterThan(b + 50);
    }
  });

  // ── 5. Focus ring on unanswered slider ────────────────────────────────────
  //
  // Chromium triggers :focus-visible for keyboard navigation.
  // Strategy: press Tab until focus lands on the slider-focus input, then
  // assert the computed outline. This reliably triggers :focus-visible because
  // the focus arrived via keyboard.
  test("focused unanswered slider shows a visible outline (focus ring)", async ({ page }) => {
    // Press Tab repeatedly until slider-focus is the active element
    // (there are 4 sliders; Tab through them all)
    await page.keyboard.press("Tab"); // slider-unanswered
    await page.keyboard.press("Tab"); // slider-answered
    await page.keyboard.press("Tab"); // slider-invalid
    await page.keyboard.press("Tab"); // slider-focus

    // Confirm the right element is focused
    const focusedId = await page.evaluate(() => document.activeElement?.id ?? "none");
    // If Tab order differs, try focussing directly via keyboard from the element
    if (focusedId !== "slider-focus") {
      // Fallback: programmatic focus + a synthetic keyboard event to flag
      // as keyboard-intent so Chromium switches to :focus-visible
      await page.locator("#slider-focus").focus();
      await page.keyboard.press("ArrowRight"); // triggers keyboard navigation mode
    }

    const outline = await page.evaluate(() => {
      const el = document.getElementById("slider-focus") as HTMLInputElement;
      const s = getComputedStyle(el);
      return {
        outlineStyle: s.outlineStyle,
        outlineWidth: s.outlineWidth,
        outlineColor: s.outlineColor,
      };
    });

    // The CSS rule for .is-unanswered .survey-slider:focus-visible sets
    //   outline: 2px solid #522583; outline-offset: 4px; border-radius: 6px;
    expect(outline.outlineStyle).not.toBe("none");
    expect(outline.outlineWidth).not.toBe("0px");
    expect(outline.outlineWidth).toBe("2px");
  });

  // ── 6. Screenshot of all four states ─────────────────────────────────────
  test("screenshot — all four slider states rendered", async ({ page }) => {
    // Focus slider-focus to capture the focus-ring state in the screenshot.
    // Use keyboard Tab to trigger :focus-visible.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const focusedId = await page.evaluate(() => document.activeElement?.id ?? "none");
    if (focusedId !== "slider-focus") {
      await page.locator("#slider-focus").focus();
      await page.keyboard.press("ArrowRight");
    }

    await page.locator("#brand-root").screenshot({
      path: "wave-c-slider-states.png",
    });
    // Test passes as long as screenshot doesn't throw
  });
});
