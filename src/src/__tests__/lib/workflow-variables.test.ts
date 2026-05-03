// BUG-10: WORKFLOW_VARIABLES tooltip must list the existing {{surveyUrl}} and {{fileLinks}} tokens.
// These tokens already exist at runtime in interpolateTemplate (workflow-service.ts) — they're just
// missing from the help panel that's rendered from this constant.

import { WORKFLOW_VARIABLES } from "@/lib/workflows/workflow-types";

describe("BUG-10: WORKFLOW_VARIABLES help panel entries", () => {
  it("lists {{surveyUrl}} so admins know it's available inside SEND_SURVEY_LINK step bodies", () => {
    expect(WORKFLOW_VARIABLES).toHaveProperty("{{surveyUrl}}");
    expect((WORKFLOW_VARIABLES as Record<string, string>)["{{surveyUrl}}"]).toMatch(/SEND_SURVEY_LINK|survey/i);
  });

  it("lists {{fileLinks}} so admins know it's available when files are attached to a step", () => {
    expect(WORKFLOW_VARIABLES).toHaveProperty("{{fileLinks}}");
    expect((WORKFLOW_VARIABLES as Record<string, string>)["{{fileLinks}}"]).toMatch(/file|attach/i);
  });
});
