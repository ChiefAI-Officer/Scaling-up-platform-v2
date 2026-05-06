import { formatVenueAddress, normalizeVideoUrl } from "@/lib/templates/landing-page-overlay";

describe("formatVenueAddress", () => {
  it("parses JSON venue object to flat string", () => {
    expect(
      formatVenueAddress('{"street":"123 Main","city":"NYC","state":"NY","zip":"10001"}')
    ).toBe("123 Main, NYC, NY, 10001");
  });

  it("passes through flat string unchanged (legacy format)", () => {
    expect(formatVenueAddress("123 Main St, NYC")).toBe("123 Main St, NYC");
  });

  it("returns empty string for null", () => {
    expect(formatVenueAddress(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatVenueAddress(undefined)).toBe("");
  });

  it("omits missing fields gracefully", () => {
    expect(formatVenueAddress('{"street":"123 Main","city":"NYC"}')).toBe("123 Main, NYC");
  });
});

describe("normalizeVideoUrl", () => {
  it("converts vimeo.com/ID to player.vimeo.com format", () => {
    expect(normalizeVideoUrl("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789"
    );
  });

  it("leaves player.vimeo.com URLs unchanged", () => {
    expect(normalizeVideoUrl("https://player.vimeo.com/video/123456789")).toBe(
      "https://player.vimeo.com/video/123456789"
    );
  });

  it("returns empty string for null", () => {
    expect(normalizeVideoUrl(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(normalizeVideoUrl(undefined)).toBe("");
  });

  it("leaves non-Vimeo URLs unchanged", () => {
    expect(normalizeVideoUrl("https://www.youtube.com/embed/abc123")).toBe(
      "https://www.youtube.com/embed/abc123"
    );
  });

  it("converts private vimeo.com/ID/HASH (path-form) to canonical player ?h= query form", () => {
    // Vimeo's canonical embed URL for unlisted videos uses ?h=HASH query string,
    // not path-form HASH. Path-form 410s on the player domain for unlisted videos.
    expect(normalizeVideoUrl("https://vimeo.com/123456789/abc123def456")).toBe(
      "https://player.vimeo.com/video/123456789?h=abc123def456"
    );
  });

  it("converts vimeo.com/ID?h=HASH (query-form share URL) to canonical player ?h= form", () => {
    expect(normalizeVideoUrl("https://vimeo.com/1170718882?h=13d047cf12")).toBe(
      "https://player.vimeo.com/video/1170718882?h=13d047cf12"
    );
  });

  it("leaves canonical player.vimeo.com/video/ID?h=HASH unchanged (idempotent)", () => {
    expect(
      normalizeVideoUrl("https://player.vimeo.com/video/1170718882?h=13d047cf12")
    ).toBe("https://player.vimeo.com/video/1170718882?h=13d047cf12");
  });

  it("leaves vimeo.com/channels/staffpicks/ID unchanged (channel URL not supported)", () => {
    expect(normalizeVideoUrl("https://vimeo.com/channels/staffpicks/123456789")).toBe(
      "https://vimeo.com/channels/staffpicks/123456789"
    );
  });

  it("normalizes YouTube watch URL", () => {
    expect(normalizeVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("normalizes YouTube short URL (youtu.be)", () => {
    expect(normalizeVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("normalizes already-embedded YouTube URL", () => {
    expect(normalizeVideoUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });
});
