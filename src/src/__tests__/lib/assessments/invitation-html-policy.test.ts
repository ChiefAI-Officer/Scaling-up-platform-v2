import {
  INVITATION_URL_TOKENS,
  countInvitationUrlTokens,
  hasInvitationUrlToken,
  isWholeInvitationUrlToken,
  resolveInvitationHtmlMode,
} from "@/lib/assessments/invitation-html-policy";

describe("invitation HTML URL-token policy", () => {
  it("recognizes every supported alias with lax inner whitespace", () => {
    expect(INVITATION_URL_TOKENS).toEqual([
      "invitationUrl",
      "invitation_url",
      "assessmentUrl",
      "assessment_url",
    ]);
    expect(countInvitationUrlTokens(
      "{{invitationUrl}} {{ invitation_url }} {{assessmentUrl}} {{ assessment_url }}",
    )).toBe(4);
  });

  it("does not resurrect encoded braces or accept partial names", () => {
    expect(hasInvitationUrlToken("&#123;&#123;invitationUrl&#125;&#125;")).toBe(false);
    expect(hasInvitationUrlToken("{{invitationUrlExtra}}")).toBe(false);
  });

  it("requires a token to occupy the whole trimmed value", () => {
    expect(isWholeInvitationUrlToken(" {{ invitationUrl }} ")).toBe(true);
    expect(isWholeInvitationUrlToken("https://x/{{invitationUrl}}")).toBe(false);
  });
});

describe("resolveInvitationHtmlMode", () => {
  it.each([
    [false, false, "<p>{{invitationUrl}}</p>", "none"],
    [false, true, "<p>body</p>", "none"],
    [true, false, "", "none"],
    [true, false, "<p>{{invitationUrl}}</p>", "full_replace"],
    [true, false, "<p>body</p>", "branded_fallback"],
    [true, true, "<p>{{invitationUrl}}</p>", "branded_body"],
    [true, true, "<p>body</p>", "branded_body"],
  ] as const)(
    "capability=%s branded=%s html=%p resolves %s",
    (waveDCustomHtmlEnabled, brandedCustomHtmlEnabled, rawHtml, expected) => {
      expect(resolveInvitationHtmlMode({
        waveDCustomHtmlEnabled,
        brandedCustomHtmlEnabled,
        rawHtml,
      })).toBe(expected);
    },
  );
});
