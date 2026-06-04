/**
 * @jest-environment jsdom
 *
 * Logo-swap regression: the Solo Landing custom-HTML starter now ships the
 * official Scaling Up logo (white, no tagline) inlined as a
 * `data:image/svg+xml;base64,...` <img>. This test locks in that the save-time
 * sanitizer (`sanitizeCustomHtml`) lets that exact markup survive a round-trip,
 * and documents WHY a data-URI <img> is used instead of an inline <svg> or a
 * data-URI on a non-img tag (both of which the sanitizer strips).
 */
import { sanitizeCustomHtml } from "@/lib/templates/sanitize-custom-html";

// The exact data-URI inlined into From Jeff/style-guide/starter-templates/solo-landing.html.
// (SU_Logo_2025_white.svg, base64-encoded.) If the starter's logo changes, this
// string must be updated to match.
const LOGO_DATA_URI =
  "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iRWJlbmVfMiIgZGF0YS1uYW1lPSJFYmVuZSAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTUuNSAzNC4yMSI+CiAgPGRlZnM+CiAgICA8c3R5bGU+CiAgICAgIC5jbHMtMSB7CiAgICAgICAgZmlsbDogI2ZmZjsKICAgICAgfQogICAgPC9zdHlsZT4KICA8L2RlZnM+CiAgPGcgaWQ9IkViZW5lXzEiIGRhdGEtbmFtZT0iRWJlbmUgMSI+CiAgICA8Zz4KICAgICAgPGc+CiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNNjIuODEsMjMuNDhjMC0uOTYtLjMyLTEuNzEtLjk3LTIuMjQtLjY1LS41NC0xLjc4LTEuMDktMy40LTEuNjZzLTIuOTUtMS4xMy0zLjk4LTEuNjZjLTMuMzUtMS43My01LjAzLTQuMTEtNS4wMy03LjE0LDAtMS41MS40Mi0yLjg0LDEuMjUtMy45OS44NC0xLjE1LDIuMDItMi4wNSwzLjU0LTIuNjksMS41My0uNjQsMy4yNC0uOTYsNS4xNS0uOTZzMy41My4zNSw1LDEuMDVjMS40Ny43LDIuNjIsMS42OSwzLjQ0LDIuOTguODIsMS4yOSwxLjIzLDIuNzYsMS4yMyw0LjQyaC02LjIyYzAtMS4xMS0uMzItMS45Ny0uOTctMi41OC0uNjUtLjYxLTEuNTItLjkyLTIuNjItLjkycy0xLjk5LjI2LTIuNjQuNzhjLS42NS41Mi0uOTcsMS4xOC0uOTcsMS45NywwLC43LjM2LDEuMzMsMS4wNywxLjlzMS45NiwxLjE1LDMuNzUsMS43NmMxLjc5LjYsMy4yNiwxLjI2LDQuNCwxLjk1LDIuNzksMS43LDQuMTksNC4wMyw0LjE5LDcuMDEsMCwyLjM4LS44NSw0LjI1LTIuNTYsNS42MS0xLjcxLDEuMzYtNC4wNCwyLjA0LTcuMDIsMi4wNC0yLjEsMC0zLjk5LS40LTUuNjktMS4xOS0xLjctLjc5LTIuOTgtMS44Ny0zLjg0LTMuMjUtLjg2LTEuMzgtMS4yOS0yLjk2LTEuMjktNC43Nmg2LjI1YzAsMS40Ni4zNiwyLjUzLDEuMDcsMy4yMi43Mi42OSwxLjg4LDEuMDQsMy40OSwxLjA0LDEuMDMsMCwxLjg0LS4yMywyLjQ0LS43LjYtLjQ3LjktMS4xMi45LTEuOTdaIi8+CiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNOTMuMTYsMjEuNWMtLjA4LDEuODktLjU3LDMuNTctMS40Niw1LjAyLS44OSwxLjQ1LTIuMTMsMi41OC0zLjc0LDMuMzdzLTMuNDQsMS4yLTUuNSwxLjJjLTMuNCwwLTYuMDctMS4xNy04LjAzLTMuNS0xLjk1LTIuMzMtMi45My01LjYyLTIuOTMtOS44N3YtMS4zNWMwLTIuNjcuNDQtNSwxLjMyLTcsLjg4LTIsMi4xNS0zLjU1LDMuODEtNC42NCwxLjY2LTEuMDksMy41OC0xLjY0LDUuNzUtMS42NCwzLjE0LDAsNS42Ni44Nyw3LjU3LDIuNjEsMS45MSwxLjc0LDIuOTksNC4xNCwzLjI1LDcuMTloLTYuMjJjLS4wNS0xLjY2LS40NC0yLjg1LTEuMTktMy41N3MtMS44OC0xLjA4LTMuNDEtMS4wOC0yLjY5LjYxLTMuNDEsMS44M2MtLjcyLDEuMjItMS4xLDMuMTctMS4xNCw1Ljg1djEuOTNjMCwyLjkuMzUsNC45OCwxLjA0LDYuMjMuNjksMS4yNSwxLjg5LDEuODcsMy41OCwxLjg3LDEuNDMsMCwyLjUzLS4zNiwzLjI5LTEuMDdzMS4xNi0xLjg0LDEuMjEtMy4zOGg2LjJaIi8+CiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTEwLjgsMjUuNjNoLTguNTRsLTEuNDksNS4wOWgtNi42Nmw5LjQ4LTI3LjIyaDUuODZsOS41NiwyNy4yMmgtNi43bC0xLjUxLTUuMDlaTTEwMy43NSwyMC41Nmg1LjU2bC0yLjc5LTkuNDQtMi43Nyw5LjQ0WiIvPgogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEyNy4xMiwyNS42N2gxMC44NXY1LjA1aC0xNy4wOVYzLjQ5aDYuMjN2MjIuMTdaIi8+CiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTQ3LjI1LDMwLjcyaC02LjIyVjMuNDloNi4yMnYyNy4yMloiLz4KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xNzMuMTgsMzAuNzJoLTYuMmwtOS4xNi0xNi45NHYxNi45NGgtNi4yM1YzLjQ5aDYuMjNsOS4xNSwxNi45NFYzLjQ5aDYuMjJ2MjcuMjJaIi8+CiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTk4LjI5LDI3LjM1Yy0uOTYsMS4xMi0yLjM2LDIuMDMtNC4yMSwyLjcxcy0zLjg3LDEuMDMtNi4wNywxLjAzYy0zLjM5LDAtNi4wOS0xLjA5LTguMTItMy4yNy0yLjAzLTIuMTgtMy4xMS01LjIyLTMuMjUtOS4xMWwtLjAyLTIuMzZjMC0yLjY4LjQ1LTUuMDIsMS4zNS03LjAyLjktMiwyLjE5LTMuNTQsMy44Ni00LjYyLDEuNjgtMS4wOCwzLjYxLTEuNjIsNS44Mi0xLjYyLDMuMjIsMCw1LjcyLjc4LDcuNSwyLjMzLDEuNzgsMS41NSwyLjgyLDMuODcsMy4xMiw2Ljk1aC02Yy0uMjEtMS41Mi0uNjctMi42MS0xLjM5LTMuMjVzLTEuNzItLjk3LTMuMDItLjk3Yy0xLjU2LDAtMi43Ny43LTMuNjIsMi4wOS0uODUsMS40LTEuMjgsMy4zOS0xLjMsNS45OHYxLjY1YzAsMi43Mi40NCw0Ljc2LDEuMzIsNi4xMi44OCwxLjM3LDIuMjcsMi4wNSw0LjE3LDIuMDUsMS42MiwwLDIuODMtLjM4LDMuNjItMS4xNHYtNC4yM2gtNC4zM3YtNC41MWgxMC41N3YxMS4xOFoiLz4KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0yMzEuMjYsMy40OXYxNy44MmMwLDIuMDItLjQxLDMuNzctMS4yMyw1LjI0LS44MiwxLjQ4LTEuOTksMi42LTMuNTIsMy4zNy0xLjUzLjc3LTMuMzMsMS4xNi01LjQyLDEuMTYtMy4xNSwwLTUuNjMtLjg2LTcuNDQtMi41OC0xLjgxLTEuNzItMi43NC00LjA4LTIuNzctNy4wN1YzLjQ5aDYuMjd2MTguMDhjLjA3LDIuOTgsMS4zOSw0LjQ3LDMuOTQsNC40NywxLjI5LDAsMi4yNy0uMzcsMi45My0xLjEyLjY2LS43NS45OS0xLjk2Ljk5LTMuNjVWMy40OWg2LjIzWiIvPgogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTI0MS4zOCwyMS40OHY5LjI0aC02LjIzVjMuNDloMTAuMzJjMS45OCwwLDMuNzMuMzgsNS4yNSwxLjE1LDEuNTIuNzcsMi43LDEuODYsMy41MywzLjI3LjgzLDEuNDIsMS4yNSwzLjAyLDEuMjUsNC44MSwwLDIuNjUtLjksNC43OC0yLjcxLDYuMzctMS44MSwxLjU5LTQuMjgsMi4zOC03LjQzLDIuMzhoLTMuOThaTTI0MS4zOCwxNi40MWg0LjA4YzEuMjEsMCwyLjEzLS4zMiwyLjc2LS45NS42My0uNjQuOTUtMS41My45NS0yLjY5LDAtMS4yNy0uMzMtMi4yOS0uOTgtMy4wNS0uNjUtLjc2LTEuNTQtMS4xNS0yLjY2LTEuMTZoLTQuMTZ2Ny44NVoiLz4KICAgICAgPC9nPgogICAgICA8Zz4KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0zLjYyLDMwLjg0Yy4xNy0uMDEuMzUtLjAzLjU0LS4wNi4xMS0uMDIuMjItLjAzLjMzLS4wNi4xOS0uMDQuMzgtLjA3LjU4LS4xMy4yLS4wNi4zNS0uMS41LS4xNi4yMS0uMDguMzgtLjE0LjU1LS4yMmwuMjgtLjEzYy4xNi0uMDguMzItLjE3LjQ4LS4yNi4wNy0uMDQuMTQtLjA4LjIyLS4xMy4yLS4xMi40MS0uMjYuNjEtLjRsLjA2LS4wNGMuMjMtLjE3LjQ3LS4zNi43LS41NWwuMDYtLjA1Yy4xLS4wOC4xOS0uMTYuMjktLjI1bC4wOC0uMDhjLjIxLS4yLjQzLS40Mi42NS0uNjUuMTgtLjE5LjMzLS4zNi40Ny0uNTQuMTYtLjIuMzMtLjQxLjUtLjYzbC4wNC0uMDVjLjEtLjE0LjIyLS4yOS4zMy0uNDVsLjMyLS40NmMuMTUtLjIzLjMxLS40Ny40Ni0uNzFsLjAzLS4wNmMuMDYtLjA5LjEyLS4xOS4xNy0uMjguMi0uMzMuNC0uNjguNTktMS4wNGwuMDItLjAzYy4yLS4zNy4zOS0uNzMuNTctMS4xMWwuMTItLjI0Yy4xNS0uMzEuMy0uNjMuNDYtLjk2bDIuMy00Ljc1Yy4xNS0uMjkuMy0uNTguNDUtLjg3LjEtLjE5LjIxLS4zOC4zMS0uNTgsMCwwLDIuMTEtMy41MSwyLjMxLTMuOGwuMy0uNDRjLjk3LTEuMzksMi4wMS0yLjY2LDMuMDgtMy43OWwuMTktLjJjLjEzLS4xMy4yNi0uMjYuMzktLjM5LjA2LS4wNi4xLS4xLjE1LS4xNS4xOC0uMTguMzgtLjM3LjU4LS41NWwuMDMtLjAzYy4xOS0uMTcuMzgtLjM0LjU3LS41MWwuMTMtLjEyYy4xNy0uMTQuMzQtLjI5LjUyLS40M2gwbC4wNS0uMDRzLjAzLS4wMi4wNS0uMDRoLjAxYy4yMS0uMTguNDMtLjM0LjY0LS41bC4xMS0uMDhjLjQ1LS4zMy45MS0uNjQsMS4zNS0uOTJsLjA3LS4wNGMuMzktLjI1Ljc2LS40NiwxLjEzLS42N2wuNjItLjM1aDBjLjMzLS4xNi42NC0uMzEuOTUtLjQ1LDEuMzUtLjYxLDIuNzctMS4wOSw0LjI2LTEuNDVIMS45NUMuODcsMCwwLC45LDAsMi4wMnYyOC44NmwzLjYyLS4wNVoiLz4KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0yOS41Niw2LjJjLS4xOS4xMS0uMzcuMjItLjU2LjM0bC0uMS4wN2MtLjE4LjEyLS4zNC4yMi0uNDkuMzNsLS4wOC4wNmMtLjE5LjEzLS4zNy4yNi0uNTUuNGwtLjA4LjA2Yy0uMTUuMTEtLjMuMjMtLjQ1LjM1bC0uMTQuMTFjLS4xNi4xMi0uMzEuMjUtLjQ2LjM4LS4wMi4wMS0uMDQuMDQtLjA3LjA2LS4xNi4xNC0uMzMuMjktLjUuNDVsLS4xMy4xMmMtLjEzLjEyLS4yNi4yNC0uMzguMzZsLS4xMS4xYy0uMi4xOS0uMzYuMzYtLjUyLjUybC0uMTguMTljLS4zMi4zNC0uNjQuNzEtLjk3LDEuMS0uMDYuMDctLjEyLjE1LS4xNy4yMmwtLjEzLjE3Yy0uMjYuMzItLjUxLjY0LS43Ni45Ny0uMDYuMDgtLjEyLjE3LS4xOC4yNmwtLjEzLjE5Yy0uMjMuMzItLjQ1LjY0LS42Ny45NmwtLjI5LjQ1Yy0uMjEuMzMtLjQyLjY2LS42MiwxbC0uMjMuMzljLS4yMi4zOC0uNDQuNzUtLjY1LDEuMTNsLS4yLjM3Yy0uMjEuMzgtLjQxLjc2LS42LDEuMTNsLS4xOC4zNWMtLjE5LjM4LS4zOC43Ni0uNTcsMS4xM2wtLjE2LjMzYy0uMjEuNDQtLjQyLjg3LS42MiwxLjI5bC0uMDQuMDgtLjY1LDEuMzdjLS4yMS40NS0uNDMuOS0uNjQsMS4zMy0uMS4yLS4yLjQxLS4zLjYxbC0uMzYuNjlzLS4wNi4xMS0uMDkuMTdjLS4xMS4xOS0uMjIuNC0uMzMuNTlsLS4xNi4yNnMtLjA2LjEtLjA5LjE0bC0uMTguMjljLS4xMi4xOS0uMjMuMzgtLjM1LjU2LS4xOS4zLS40LjU5LS42Ljg3bC0uMzkuNTNjLS4wNy4xLS4xNS4yLS4yMy4zLS4xMy4xNy0uMjYuMzMtLjQuNDlsLS4xMS4xM2MtLjEzLjE1LS4yMy4yNy0uMzQuMzlsLS4zMi4zNXMtLjA3LjA4LS4xMS4xMmMtLjAxLjAyLS4wNC4wNS0uMDcuMDhsLS40OC40OGMtLjA2LjA2LS4xMi4xMS0uMTguMTZsLS4wOC4wN2MtLjEyLjExLS4yNC4yMi0uMzYuMzNsLS4wOS4wOGMtLjE4LjE1LS4zNS4yOS0uNTIuNDNsLS4yNi4xOWMtLjA5LjA3LS4xOS4xNC0uMjkuMjEtLjE3LjEyLS4zLjIxLS40My4yOWwtLjEyLjA4LS4wNi4wNC0uMzkuMjNzLS4wNS4wMy0uMDcuMDRjLS4yNC4xMy0uNDQuMjQtLjY1LjM0LS4wNy4wNC0uMTEuMDYtLjE0LjA3bC0uMTYuMDdjLS4wNy4wMy0uMTUuMDctLjIzLjFsLS4xLjA0Yy0uMDguMDMtLjEyLjA1LS4xNS4wNmgtLjAxczMwLjIyLDAsMzAuMjIsMGMxLjA3LDAsMS45NS0uOSwxLjk1LTIuMDJWMy40M2MtMy42Ny4xNy02Ljg3LDEuMDgtOS43MywyLjc3Ii8+CiAgICAgIDwvZz4KICAgIDwvZz4KICA8L2c+Cjwvc3ZnPg==";

const BRANDBAR_IMG =
  `<img class="su-logo" src="${LOGO_DATA_URI}" alt="Scaling Up" width="180" height="24" />`;

// The full <header> brandbar snippet as it appears in the starter, comment included.
const BRANDBAR_BLOCK = `<div class="su-brandbar">
  <!-- Official Scaling Up logo (white, no tagline) inlined as a data-URI: self-contained, sanitizer-safe, and survives the planned platform.scalingup.com domain change (no host dependency). -->
  ${BRANDBAR_IMG}
</div>`;

describe("Solo Landing logo-swap: sanitizer round-trip", () => {
  it("preserves the data:image/svg+xml;base64 <img> (does not strip it)", () => {
    const result = sanitizeCustomHtml(BRANDBAR_IMG);

    // The <img> tag survives.
    expect(result.sanitized).toContain("<img");
    expect(result.sanitized).toContain('class="su-logo"');
    expect(result.sanitized).toContain('alt="Scaling Up"');

    // The full data-URI src survives intact (not stripped, not truncated).
    expect(result.sanitized).toContain(LOGO_DATA_URI);
    expect(result.sanitized).toContain("data:image/svg+xml;base64,");
  });

  it("reports no stripped attrs/tags for the img and never throws", () => {
    let result: ReturnType<typeof sanitizeCustomHtml> | undefined;
    expect(() => {
      result = sanitizeCustomHtml(BRANDBAR_IMG);
    }).not.toThrow();

    expect(result).toBeDefined();
    expect(result!.strippedAttrs).toEqual([]);
    expect(result!.strippedTags).toEqual([]);
    expect(result!.didStripContent).toBe(false);
  });

  it("preserves the img when wrapped in the full brandbar block (comment + div)", () => {
    const result = sanitizeCustomHtml(BRANDBAR_BLOCK);

    expect(result.sanitized).toContain('class="su-brandbar"');
    expect(result.sanitized).toContain(LOGO_DATA_URI);
    expect(result.sanitized).toContain("data:image/svg+xml;base64,");
    expect(result.strippedAttrs).toEqual([]);
  });

  // --- Negative controls: WHY we use a data-URI <img> and not the alternatives ---

  it("NEGATIVE CONTROL: an inline <svg> is stripped (justifies the data-URI img approach)", () => {
    const inlineSvg =
      '<svg viewBox="0 0 255.5 34.21"><path d="M62.81,23.48Z" fill="#fff"/></svg>';
    const result = sanitizeCustomHtml(inlineSvg);

    // <svg> is not in the allowedTags, so it (and its children) are dropped.
    expect(result.sanitized).not.toContain("<svg");
    expect(result.sanitized).not.toContain("<path");
  });

  it("NEGATIVE CONTROL: a data: URI on a non-img tag (<a href>) is stripped", () => {
    const dataHrefAnchor = `<a href="${LOGO_DATA_URI}">logo</a>`;
    const result = sanitizeCustomHtml(dataHrefAnchor);

    // <a> only permits https/mailto/tel schemes; the data: href is dropped.
    expect(result.sanitized).not.toContain("data:image/svg+xml;base64,");
    expect(result.sanitized).not.toContain("href=");
    // The anchor text/tag itself survives — only the disallowed scheme href is removed.
    expect(result.sanitized).toContain("logo");
  });
});
