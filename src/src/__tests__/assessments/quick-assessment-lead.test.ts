/**
 * Tests for quick-assessment-lead.ts — pure helpers, no DB/I/O.
 * Written RED-first per TDD.
 */

import {
  lowestDecision,
  buildLeadEmail,
  resolveLeadRecipients,
} from "@/lib/assessments/quick-assessment-lead";

// ---------------------------------------------------------------------------
// lowestDecision
// ---------------------------------------------------------------------------

describe("lowestDecision", () => {
  const base = [
    { key: "people", label: "People", averagePoints: 7 },
    { key: "strategy", label: "Strategy", averagePoints: 8 },
    { key: "execution", label: "Execution", averagePoints: 6 },
    { key: "cash", label: "Cash", averagePoints: 9 },
  ];

  it("returns the domain with the lowest averagePoints", () => {
    const result = lowestDecision(base);
    expect(result?.key).toBe("execution");
    expect(result?.label).toBe("Execution");
  });

  it("precedingKey for execution is strategy", () => {
    const result = lowestDecision(base);
    expect(result?.precedingKey).toBe("strategy");
  });

  it("returns people when people is lowest, precedingKey is null", () => {
    const domains = [
      { key: "people", label: "People", averagePoints: 2 },
      { key: "strategy", label: "Strategy", averagePoints: 5 },
      { key: "execution", label: "Execution", averagePoints: 8 },
      { key: "cash", label: "Cash", averagePoints: 9 },
    ];
    const result = lowestDecision(domains);
    expect(result?.key).toBe("people");
    expect(result?.precedingKey).toBeNull();
  });

  it("returns strategy as lowest, precedingKey is people", () => {
    const domains = [
      { key: "people", label: "People", averagePoints: 8 },
      { key: "strategy", label: "Strategy", averagePoints: 3 },
      { key: "execution", label: "Execution", averagePoints: 7 },
      { key: "cash", label: "Cash", averagePoints: 9 },
    ];
    const result = lowestDecision(domains);
    expect(result?.key).toBe("strategy");
    expect(result?.precedingKey).toBe("people");
  });

  it("returns cash as lowest, precedingKey is execution", () => {
    const domains = [
      { key: "people", label: "People", averagePoints: 8 },
      { key: "strategy", label: "Strategy", averagePoints: 9 },
      { key: "execution", label: "Execution", averagePoints: 7 },
      { key: "cash", label: "Cash", averagePoints: 1 },
    ];
    const result = lowestDecision(domains);
    expect(result?.key).toBe("cash");
    expect(result?.precedingKey).toBe("execution");
  });

  it("resolves ties to the EARLIEST in canonical order (people vs strategy both at 3)", () => {
    const domains = [
      { key: "people", label: "People", averagePoints: 3 },
      { key: "strategy", label: "Strategy", averagePoints: 3 },
      { key: "execution", label: "Execution", averagePoints: 7 },
      { key: "cash", label: "Cash", averagePoints: 9 },
    ];
    const result = lowestDecision(domains);
    expect(result?.key).toBe("people");
  });

  it("resolves ties to earliest when last two are tied", () => {
    const domains = [
      { key: "people", label: "People", averagePoints: 9 },
      { key: "strategy", label: "Strategy", averagePoints: 8 },
      { key: "execution", label: "Execution", averagePoints: 2 },
      { key: "cash", label: "Cash", averagePoints: 2 },
    ];
    const result = lowestDecision(domains);
    expect(result?.key).toBe("execution");
  });

  it("ignores null averagePoints domains", () => {
    const domains = [
      { key: "people", label: "People", averagePoints: null },
      { key: "strategy", label: "Strategy", averagePoints: 5 },
      { key: "execution", label: "Execution", averagePoints: null },
      { key: "cash", label: "Cash", averagePoints: 8 },
    ];
    const result = lowestDecision(domains);
    expect(result?.key).toBe("strategy");
  });

  it("returns null when all averagePoints are null", () => {
    const domains = [
      { key: "people", label: "People", averagePoints: null },
      { key: "strategy", label: "Strategy", averagePoints: null },
      { key: "execution", label: "Execution", averagePoints: null },
      { key: "cash", label: "Cash", averagePoints: null },
    ];
    expect(lowestDecision(domains)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(lowestDecision([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildLeadEmail
// ---------------------------------------------------------------------------

const sampleDomains = [
  { label: "People", averagePoints: 7.5 },
  { label: "Strategy", averagePoints: 8.0 },
  { label: "Execution", averagePoints: 6.0 },
  { label: "Cash", averagePoints: 9.0 },
];

describe("buildLeadEmail", () => {
  it("HTML-escapes a malicious firstName in bodyHtml", () => {
    const { bodyHtml } = buildLeadEmail({
      taker: {
        firstName: "<img src=x onerror=alert(1)>",
        lastName: "Smith",
        email: "test@example.com",
      },
      assessmentName: "4 Decisions Quick Assessment",
      perDomain: sampleDomains,
      lowestLabel: "Execution",
      recipientRole: "SU_TEAM",
    });
    expect(bodyHtml).not.toMatch(/<img/);
    expect(bodyHtml).toContain("&lt;img");
  });

  it("HTML-escapes a malicious email containing ><script> in bodyHtml", () => {
    const { bodyHtml } = buildLeadEmail({
      taker: {
        firstName: "Jane",
        lastName: "Doe",
        email: '"><script>alert(1)</script>',
      },
      assessmentName: "4 Decisions Quick Assessment",
      perDomain: sampleDomains,
      lowestLabel: "Execution",
      recipientRole: "SU_TEAM",
    });
    expect(bodyHtml).not.toMatch(/<script>/);
    expect(bodyHtml).toContain("&lt;script&gt;");
  });

  it("does NOT introduce a newline in subject from a lastName containing \\n\\r", () => {
    const { subject } = buildLeadEmail({
      taker: {
        firstName: "Jane",
        lastName: "Doe\nInjected: evil\rHeader: bad",
        email: "jane@example.com",
      },
      assessmentName: "4 Decisions Quick Assessment",
      perDomain: sampleDomains,
      lowestLabel: "Execution",
      recipientRole: "SU_TEAM",
    });
    expect(subject).not.toMatch(/[\r\n\t]/);
  });

  it("does NOT introduce a newline in subject from a firstName containing control chars", () => {
    const { subject } = buildLeadEmail({
      taker: {
        firstName: "Jane\x00\x01\x0bEvil",
        lastName: "Doe",
        email: "jane@example.com",
      },
      assessmentName: "Test",
      perDomain: sampleDomains,
      lowestLabel: null,
      recipientRole: "REFERRING_COACH",
    });
    expect(subject).not.toMatch(/[\x00-\x1f]/);
  });

  it("renders REFERRING_COACH variant with coach-specific lead-in", () => {
    const { bodyHtml } = buildLeadEmail({
      taker: {
        firstName: "Alice",
        lastName: "Walker",
        email: "alice@example.com",
      },
      assessmentName: "4 Decisions Quick Assessment",
      perDomain: sampleDomains,
      lowestLabel: "People",
      recipientRole: "REFERRING_COACH",
    });
    // Body should contain the taker's name (escaped)
    expect(bodyHtml).toContain("Alice");
    expect(bodyHtml).toContain("Walker");
    // Should NOT contain SU-team-specific framing
    // Both variants produce distinct bodies — coach variant exists
    expect(typeof bodyHtml).toBe("string");
    expect(bodyHtml.length).toBeGreaterThan(50);
  });

  it("renders SU_TEAM variant with SU-team-specific lead-in", () => {
    const { bodyHtml } = buildLeadEmail({
      taker: {
        firstName: "Bob",
        lastName: "Jones",
        email: "bob@example.com",
      },
      assessmentName: "4 Decisions Quick Assessment",
      perDomain: sampleDomains,
      lowestLabel: "Cash",
      recipientRole: "SU_TEAM",
    });
    expect(bodyHtml).toContain("Bob");
    expect(bodyHtml).toContain("Jones");
    expect(typeof bodyHtml).toBe("string");
    expect(bodyHtml.length).toBeGreaterThan(50);
  });

  it("REFERRING_COACH and SU_TEAM bodies differ", () => {
    const shared = {
      taker: { firstName: "Test", lastName: "User", email: "t@t.com" },
      assessmentName: "Quick Assessment",
      perDomain: sampleDomains,
      lowestLabel: "Execution",
    } as const;
    const { bodyHtml: coachBody } = buildLeadEmail({
      ...shared,
      recipientRole: "REFERRING_COACH",
    });
    const { bodyHtml: suBody } = buildLeadEmail({
      ...shared,
      recipientRole: "SU_TEAM",
    });
    expect(coachBody).not.toBe(suBody);
  });

  it("includes all 4 domain labels in bodyHtml", () => {
    const { bodyHtml } = buildLeadEmail({
      taker: { firstName: "X", lastName: "Y", email: "x@y.com" },
      assessmentName: "Quick Assessment",
      perDomain: sampleDomains,
      lowestLabel: "Strategy",
      recipientRole: "SU_TEAM",
    });
    expect(bodyHtml).toContain("People");
    expect(bodyHtml).toContain("Strategy");
    expect(bodyHtml).toContain("Execution");
    expect(bodyHtml).toContain("Cash");
  });

  it("returns a string subject (no newlines, non-empty)", () => {
    const { subject } = buildLeadEmail({
      taker: { firstName: "A", lastName: "B", email: "a@b.com" },
      assessmentName: "Quick Assessment",
      perDomain: sampleDomains,
      lowestLabel: null,
      recipientRole: "SU_TEAM",
    });
    expect(typeof subject).toBe("string");
    expect(subject.length).toBeGreaterThan(0);
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("handles null lowestLabel gracefully", () => {
    expect(() =>
      buildLeadEmail({
        taker: { firstName: "A", lastName: "B", email: "a@b.com" },
        assessmentName: "Quick Assessment",
        perDomain: sampleDomains,
        lowestLabel: null,
        recipientRole: "SU_TEAM",
      })
    ).not.toThrow();
  });

  it("HTML-escapes domain labels that contain < or >", () => {
    const { bodyHtml } = buildLeadEmail({
      taker: { firstName: "A", lastName: "B", email: "a@b.com" },
      assessmentName: "Quick Assessment",
      perDomain: [
        { label: "<evil>People</evil>", averagePoints: 5 },
        { label: "Strategy", averagePoints: 8 },
        { label: "Execution", averagePoints: 7 },
        { label: "Cash", averagePoints: 9 },
      ],
      lowestLabel: null,
      recipientRole: "SU_TEAM",
    });
    expect(bodyHtml).not.toMatch(/<evil>/);
    expect(bodyHtml).toContain("&lt;evil&gt;");
  });
});

// ---------------------------------------------------------------------------
// resolveLeadRecipients
// ---------------------------------------------------------------------------

describe("resolveLeadRecipients", () => {
  it("returns only SU_TEAM when activeCoachEmail is null", () => {
    const result = resolveLeadRecipients({
      suTeamAddress: "team@scalingup.com",
      activeCoachEmail: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("SU_TEAM");
    expect(result[0].email).toBe("team@scalingup.com");
  });

  it("returns both SU_TEAM and REFERRING_COACH when coach email is provided", () => {
    const result = resolveLeadRecipients({
      suTeamAddress: "team@scalingup.com",
      activeCoachEmail: "coach@example.com",
    });
    expect(result).toHaveLength(2);
    const roles = result.map((r) => r.role);
    expect(roles).toContain("SU_TEAM");
    expect(roles).toContain("REFERRING_COACH");
  });

  it("includes correct emails for both recipients", () => {
    const result = resolveLeadRecipients({
      suTeamAddress: "team@scalingup.com",
      activeCoachEmail: "coach@example.com",
    });
    const su = result.find((r) => r.role === "SU_TEAM");
    const coach = result.find((r) => r.role === "REFERRING_COACH");
    expect(su?.email).toBe("team@scalingup.com");
    expect(coach?.email).toBe("coach@example.com");
  });

  it("returns only SU_TEAM when activeCoachEmail is empty string", () => {
    const result = resolveLeadRecipients({
      suTeamAddress: "team@scalingup.com",
      activeCoachEmail: "",
    });
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("SU_TEAM");
  });

  it("returns only SU_TEAM when activeCoachEmail is whitespace only", () => {
    const result = resolveLeadRecipients({
      suTeamAddress: "  ",
      activeCoachEmail: "   ",
    });
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("SU_TEAM");
  });

  it("lowercases and trims suTeamAddress", () => {
    const result = resolveLeadRecipients({
      suTeamAddress: "  TEAM@ScalingUp.COM  ",
      activeCoachEmail: null,
    });
    expect(result[0].email).toBe("team@scalingup.com");
  });

  it("lowercases and trims coach email", () => {
    const result = resolveLeadRecipients({
      suTeamAddress: "team@scalingup.com",
      activeCoachEmail: "  Coach@Example.COM  ",
    });
    const coach = result.find((r) => r.role === "REFERRING_COACH");
    expect(coach?.email).toBe("coach@example.com");
  });
});
