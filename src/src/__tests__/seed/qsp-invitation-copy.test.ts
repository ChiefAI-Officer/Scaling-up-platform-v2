import { buildQspV1Content } from "../../../prisma/seed-qsp-v1-assessment";
import { buildQspV2Content } from "../../../prisma/seed-qsp-v2-assessment";

const COACH_FORWARD_BODY = `Hi {{respondentFirstName}},

You've been invited by {{coachName}} to complete the {{templateName}} for {{organizationName}}.

It takes just a few minutes, and there are no right or wrong answers — your honest perspective is what makes the results useful. Your responses are confidential.

Click the button below to begin.`;

const INVITATION_SUBJECT = "Please complete your Quarterly Session Prep";

const QSP_VERSIONS = [
  {
    label: "QSP v1",
    build: buildQspV1Content,
    alias: "qsp-v1",
    name: "Quarterly Session Prep v1",
  },
  {
    label: "QSP v2",
    build: buildQspV2Content,
    alias: "qsp-v2",
    name: "Quarterly Session Prep v2",
  },
];

describe.each(QSP_VERSIONS)("$label canonical invitation copy", ({ build, alias, name }) => {
  const content = build();

  it("uses the approved coach-forward body", () => {
    expect(content.invitationBodyMarkdown).toBe(COACH_FORWARD_BODY);
  });

  it("preserves its template identity and invitation subject", () => {
    expect(content.alias).toBe(alias);
    expect(content.name).toBe(name);
    expect(content.invitationSubject).toBe(INVITATION_SUBJECT);
  });

  it("leaves the canonical invitation link to the universal email shell", () => {
    expect(content.invitationBodyMarkdown).not.toContain("{{invitationUrl}}");
    expect(content.invitationBodyMarkdown).not.toContain("{{assessmentUrl}}");
  });
});
