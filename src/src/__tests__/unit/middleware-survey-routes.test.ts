/**
 * BUG-07: Middleware Survey Routes Public Access
 *
 * Survey links embedded in workflow emails must be accessible without authentication.
 * This tests the regex and public-route logic that controls which /api/surveys/ paths
 * are allowed through unauthenticated.
 *
 * Two fix points in middleware.ts:
 *  1. API protection block (~line 84): regex allows /api/surveys/[id] and /api/surveys/[id]/submit
 *  2. authorized callback (~line 127): /survey/[id] page and the same API regex are whitelisted
 */

// The regex extracted from middleware.ts for unit testing
const SURVEY_API_REGEX = /^\/api\/surveys\/(?!assign|workflows)[^/]+(\/submit)?$/;

describe("BUG-07: Survey middleware public-route regex", () => {
  describe("allowed unauthenticated (survey fetch & submit)", () => {
    it("allows GET /api/surveys/abc123", () => {
      expect(SURVEY_API_REGEX.test("/api/surveys/abc123")).toBe(true);
    });

    it("allows POST /api/surveys/abc123/submit", () => {
      expect(SURVEY_API_REGEX.test("/api/surveys/abc123/submit")).toBe(true);
    });

    it("allows survey IDs with hyphens", () => {
      expect(SURVEY_API_REGEX.test("/api/surveys/survey-id-with-hyphens")).toBe(true);
    });

    it("allows survey IDs with underscores", () => {
      expect(SURVEY_API_REGEX.test("/api/surveys/survey_id_123")).toBe(true);
    });

    it("allows survey IDs that are UUIDs", () => {
      expect(SURVEY_API_REGEX.test("/api/surveys/clxyz1234abcd")).toBe(true);
    });

    it("allows /submit suffix on UUID-style IDs", () => {
      expect(SURVEY_API_REGEX.test("/api/surveys/clxyz1234abcd/submit")).toBe(true);
    });
  });

  describe("blocked unauthenticated (protected admin survey routes)", () => {
    it("blocks /api/surveys/assign — negative lookahead", () => {
      expect(SURVEY_API_REGEX.test("/api/surveys/assign")).toBe(false);
    });

    it("blocks /api/surveys/workflows — negative lookahead", () => {
      expect(SURVEY_API_REGEX.test("/api/surveys/workflows")).toBe(false);
    });

    it("blocks /api/surveys/ (bare, no ID segment)", () => {
      expect(SURVEY_API_REGEX.test("/api/surveys/")).toBe(false);
    });

    it("blocks /api/surveys (no trailing slash, no ID)", () => {
      expect(SURVEY_API_REGEX.test("/api/surveys")).toBe(false);
    });

    it("does not match deeper nested paths beyond /submit", () => {
      // e.g. /api/surveys/abc123/submit/extra should not match
      expect(SURVEY_API_REGEX.test("/api/surveys/abc123/submit/extra")).toBe(false);
    });
  });
});

// The survey page route — checked via startsWith("/survey/") in authorized callback
describe("BUG-07: Survey page public route check", () => {
  const isSurveyPagePublic = (pathname: string): boolean =>
    pathname.startsWith("/survey/");

  it("allows unauthenticated GET /survey/abc123", () => {
    expect(isSurveyPagePublic("/survey/abc123")).toBe(true);
  });

  it("allows survey page paths with nested segments", () => {
    expect(isSurveyPagePublic("/survey/abc123/confirm")).toBe(true);
  });

  it("does not match /surveys/ (plural — that is an admin route)", () => {
    expect(isSurveyPagePublic("/surveys/abc123")).toBe(false);
  });

  it("does not match /api/survey/ (API path, not page path)", () => {
    expect(isSurveyPagePublic("/api/survey/abc123")).toBe(false);
  });
});
