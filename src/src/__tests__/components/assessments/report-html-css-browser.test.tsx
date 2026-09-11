/** @jest-environment node */

import { chromium, type Browser } from "playwright";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportHtmlSection } from "@/components/assessments/ReportHtmlSection";
import { sanitizeReportHtmlFragment } from "@/lib/assessments/report-html-sanitizer";
import type { SafeReportHtmlFragment } from "@/lib/assessments/report-html";

jest.setTimeout(30_000);

describe("authored report CSS in a browser", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  it.each(["screen", "print"] as const)(
    "applies Closing CSS inside that region only in %s output",
    async (media) => {
      const welcome = sanitizeReportHtmlFragment(
        '<p class="welcome-copy">Welcome copy</p>',
        "introduction",
      );
      const closing = sanitizeReportHtmlFragment(
        '<style>p { color: rgb(255, 0, 0); } .promo { display: flex; gap: 16px; padding: 32px; }</style><div class="promo"><p>Closing copy</p></div>',
        "conclusion",
      );
      expect(welcome.ok).toBe(true);
      expect(closing.ok).toBe(true);

      const markup = renderToStaticMarkup(
        <main>
          <p id="generated-copy">Generated copy</p>
          <ReportHtmlSection
            position="introduction"
            html={welcome.html as SafeReportHtmlFragment}
          />
          <ReportHtmlSection
            position="conclusion"
            html={closing.html as SafeReportHtmlFragment}
          />
          <footer><p id="footer-copy">Footer copy</p></footer>
        </main>,
      );

      const page = await browser.newPage();
      await page.setContent(`<style>p { color: rgb(0, 0, 0); }</style>${markup}`);
      await page.emulateMedia({ media });

      const styles = await page.evaluate(() => {
        const style = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error(`Missing ${selector}`);
          return getComputedStyle(element);
        };
        return {
          closingColor: style(".su-report-custom-html--conclusion p").color,
          closingDisplay: style(".su-report-custom-html--conclusion .promo").display,
          generatedColor: style("#generated-copy").color,
          welcomeColor: style(".welcome-copy").color,
          footerColor: style("#footer-copy").color,
        };
      });

      expect(styles).toEqual({
        closingColor: "rgb(255, 0, 0)",
        closingDisplay: "flex",
        generatedColor: "rgb(0, 0, 0)",
        welcomeColor: "rgb(0, 0, 0)",
        footerColor: "rgb(0, 0, 0)",
      });

      await page.close();
    },
  );

  it("keeps the same author class independent between Welcome and Closing", async () => {
    const welcome = sanitizeReportHtmlFragment(
      '<style>.promo { color: rgb(0, 0, 255); }</style><p class="promo">Welcome</p>',
      "introduction",
    );
    const closing = sanitizeReportHtmlFragment(
      '<style>.promo { color: rgb(255, 0, 0); }</style><p class="promo">Closing</p>',
      "conclusion",
    );
    expect(welcome.ok).toBe(true);
    expect(closing.ok).toBe(true);

    const markup = renderToStaticMarkup(
      <main>
        <ReportHtmlSection position="introduction" html={welcome.html as SafeReportHtmlFragment} />
        <ReportHtmlSection position="conclusion" html={closing.html as SafeReportHtmlFragment} />
      </main>,
    );
    const page = await browser.newPage();
    try {
      await page.setContent(markup);

      expect(await page.locator(".su-report-custom-html--introduction .promo").evaluate(
        (element) => getComputedStyle(element).color,
      )).toBe("rgb(0, 0, 255)");
      expect(await page.locator(".su-report-custom-html--conclusion .promo").evaluate(
        (element) => getComputedStyle(element).color,
      )).toBe("rgb(255, 0, 0)");
    } finally {
      await page.close();
    }
  });

  it("rejects keyframes because Chromium keeps their names document-global inside @scope", async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <style>
          @scope (.author-region) {
            @keyframes authored-pulse { from, to { opacity: .25; } }
          }
          #outside { animation: authored-pulse 1s linear infinite; }
        </style>
        <div class="author-region">Author region</div>
        <div id="outside">Generated report content</div>
      `);
      await page.waitForTimeout(50);

      expect(await page.locator("#outside").evaluate(
        (element) => getComputedStyle(element).opacity,
      )).toBe("0.25");

      const rejected = sanitizeReportHtmlFragment(
        "<style>@keyframes authored-pulse { from, to { opacity: .25; } }</style><p>Closing</p>",
        "conclusion",
      );
      expect(rejected).toMatchObject({ ok: false, html: "" });
      expect(rejected.issue).toMatch(/keyframes/i);
    } finally {
      await page.close();
    }
  });

  it("rejects CSS escapes and variables that Chromium resolves into blocked behavior", async () => {
    const escapedProperty = String.raw`.escaped-property { p\6fsition: fixed; }`;
    const escapedFunction = String.raw`.escaped-function { background-image: image\2d set("http://evil.test/x" 1x); }`;
    const customProperty = ".custom-property { --placement: fixed; position: var(--placement); }";
    const attributeSubstitution = ".attribute-substitution { position: attr(title type(<custom-ident>), static); }";
    const environmentSubstitution = ".environment-substitution { position: env(report-position, fixed); }";
    const environmentImage = `.environment-image { background-image: image-set(env(report-image, "http://evil.test/x" 1x)); }`;
    const conditionalSubstitution = ".conditional-substitution { position: if(style(--chapter-color): fixed; else: static); }";
    const vendorSticky = ".vendor-sticky { position: -webkit-sticky; }";
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <style>@scope (.author-region) { ${escapedProperty}${escapedFunction}${customProperty}${attributeSubstitution}${environmentSubstitution}${environmentImage}${conditionalSubstitution} }</style>
        <div class="author-region" style="--chapter-color: plum">
          <div class="escaped-property">Escaped property</div>
          <div class="escaped-function">Escaped function</div>
          <div class="custom-property">Custom property</div>
          <div class="attribute-substitution" title="fixed">Attribute substitution</div>
          <div class="environment-substitution">Environment substitution</div>
          <div class="environment-image">Environment image</div>
          <div class="conditional-substitution">Conditional substitution</div>
        </div>
      `);
      const browserBehavior = await page.evaluate(() => ({
        escapedPosition: getComputedStyle(document.querySelector(".escaped-property")!).position,
        escapedImage: getComputedStyle(document.querySelector(".escaped-function")!).backgroundImage,
        variablePosition: getComputedStyle(document.querySelector(".custom-property")!).position,
        attributePosition: getComputedStyle(document.querySelector(".attribute-substitution")!).position,
        environmentPosition: getComputedStyle(document.querySelector(".environment-substitution")!).position,
        environmentImage: getComputedStyle(document.querySelector(".environment-image")!).backgroundImage,
        conditionalPosition: getComputedStyle(document.querySelector(".conditional-substitution")!).position,
      }));
      expect(browserBehavior.escapedPosition).toBe("fixed");
      expect(browserBehavior.escapedImage).toContain("http://evil.test/x");
      expect(browserBehavior.variablePosition).toBe("fixed");
      expect(browserBehavior.attributePosition).toBe("fixed");
      expect(browserBehavior.environmentPosition).toBe("fixed");
      expect(browserBehavior.environmentImage).toContain("http://evil.test/x");
      expect(browserBehavior.conditionalPosition).toBe("fixed");

      for (const css of [escapedProperty, escapedFunction, customProperty, attributeSubstitution, environmentSubstitution, environmentImage, conditionalSubstitution, vendorSticky]) {
        const rejected = sanitizeReportHtmlFragment(
          `<style>${css}</style><p>Closing</p>`,
          "conclusion",
        );
        expect(rejected).toMatchObject({ ok: false, html: "" });
      }
    } finally {
      await page.close();
    }
  });
});
