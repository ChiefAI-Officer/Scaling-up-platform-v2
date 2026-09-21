import {
  memberPortalSignInUrl,
  renderMemberPortalDiscoveryEmail,
} from "@/lib/members/discovery";

describe("member portal discovery links", () => {
  it("resolves the sign-in route from the configured app origin", () => {
    expect(memberPortalSignInUrl("https://app.example.com/admin")).toBe(
      "https://app.example.com/member/sign-in",
    );
  });

  it.each([
    "javascript:alert(1)",
    "http://app.example.com/member/sign-in",
    "https://user:password@app.example.com/member/sign-in",
  ])("does not render an unsafe email URL: %s", (url) => {
    expect(renderMemberPortalDiscoveryEmail(url)).toBe("");
  });

  it("allows local HTTP origins for development", () => {
    expect(memberPortalSignInUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/member/sign-in",
    );
  });
});
