/**
 * Wave F #22 (R2-LOW-1): Real `Cache-Control: no-store, private` header on the
 * assessment report routes via middleware.
 *
 * The branded results report pages render named PII (scores, answers). Both the
 * PER-RESPONDENT report (`/assessments/<id>/respondents/<rid>/report`) and the
 * CAMPAIGN-LEVEL GROUP report (`/assessments/<id>/report`) must be served
 * `no-store, private` so they are never cached by the browser or proxies.
 *
 * The middleware logic under test (middleware.ts ~line 113):
 *   if (REPORT_NO_STORE_REGEX.test(pathname)) {
 *     passthrough.headers.set("Cache-Control", "no-store, private");
 *   }
 *
 * The regex is extracted here for unit testing — importing middleware.ts pulls in
 * next-auth → jose (ESM) which Jest does not transform, so we mirror the
 * regex-driven style of __tests__/unit/middleware-survey-routes.test.ts. Keep this
 * in sync with REPORT_NO_STORE_REGEX in middleware.ts.
 */

// Extracted verbatim from middleware.ts (REPORT_NO_STORE_REGEX) — keep in sync.
const REPORT_NO_STORE_REGEX =
  /^\/assessments\/[^/]+\/(respondents\/[^/]+\/)?report\/?$/;

// The exact header value the per-respondent path already gets; the group report
// must get the IDENTICAL value.
const NO_STORE_HEADER_VALUE = "no-store, private";

/** Mirrors the middleware's no-store decision + header value for a given path. */
function noStoreHeaderFor(pathname: string): string | undefined {
  return REPORT_NO_STORE_REGEX.test(pathname) ? NO_STORE_HEADER_VALUE : undefined;
}

describe("R2-LOW-1: assessment report no-store middleware", () => {
  describe("group report (campaign-level) gets no-store, private", () => {
    it("sets the header on /assessments/abc123/report", () => {
      expect(noStoreHeaderFor("/assessments/abc123/report")).toBe(
        "no-store, private"
      );
    });

    it("sets the header on the group report with a trailing slash", () => {
      expect(noStoreHeaderFor("/assessments/abc123/report/")).toBe(
        "no-store, private"
      );
    });

    it("allows hyphen/underscore ids on the group report", () => {
      expect(noStoreHeaderFor("/assessments/cmp_abc-123/report")).toBe(
        "no-store, private"
      );
    });

    it("uses the SAME header value as the per-respondent report", () => {
      expect(noStoreHeaderFor("/assessments/abc123/report")).toBe(
        noStoreHeaderFor("/assessments/abc123/respondents/xyz789/report")
      );
    });
  });

  describe("per-respondent report still gets no-store (no regression)", () => {
    it("sets the header on /assessments/abc123/respondents/xyz789/report", () => {
      expect(
        noStoreHeaderFor("/assessments/abc123/respondents/xyz789/report")
      ).toBe("no-store, private");
    });

    it("sets the header on the per-respondent report with a trailing slash", () => {
      expect(
        noStoreHeaderFor("/assessments/abc123/respondents/xyz789/report/")
      ).toBe("no-store, private");
    });
  });

  describe("unrelated routes do NOT get the no-store header", () => {
    it("does not set it on the campaign page without /report", () => {
      expect(noStoreHeaderFor("/assessments/abc123")).toBeUndefined();
    });

    it("does not set it on the campaign page with a trailing slash", () => {
      expect(noStoreHeaderFor("/assessments/abc123/")).toBeUndefined();
    });

    it("does not set it on the bare /assessments index", () => {
      expect(noStoreHeaderFor("/assessments")).toBeUndefined();
    });

    it("does not set it on the coach portal home", () => {
      expect(noStoreHeaderFor("/portal/home")).toBeUndefined();
    });

    it("does not set it on an API route that contains /report", () => {
      expect(
        noStoreHeaderFor("/api/assessments/abc123/report")
      ).toBeUndefined();
    });

    it("does not set it on a respondents listing without /report", () => {
      expect(
        noStoreHeaderFor("/assessments/abc123/respondents/xyz789")
      ).toBeUndefined();
    });

    it("does not match a path with extra segments after /report", () => {
      expect(
        noStoreHeaderFor("/assessments/abc123/report/extra")
      ).toBeUndefined();
    });

    it("does not match a respondents path missing the respondent id", () => {
      expect(
        noStoreHeaderFor("/assessments/abc123/respondents/report")
      ).toBeUndefined();
    });
  });
});
