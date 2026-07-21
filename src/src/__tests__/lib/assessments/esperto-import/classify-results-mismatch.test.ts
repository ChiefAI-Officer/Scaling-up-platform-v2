/**
 * #87 — resultsLaneMismatchMessage: the human, actionable message shown when a
 * non-report export is fed into the Results import lane. Shared by the admin +
 * coach import routes so their guidance stays in lockstep.
 *
 * A good message names WHAT was uploaded and WHERE it belongs, and never leaks
 * the internal classifier vocabulary ("got restricted-individual").
 */

import { resultsLaneMismatchMessage } from "@/lib/assessments/esperto-import/classify";

describe("resultsLaneMismatchMessage (#87)", () => {
  it("guides a Members export to the 'Roster (people)' import option (the on-screen label)", () => {
    const msg = resultsLaneMismatchMessage("members");
    expect(msg).toMatch(/Members export/i);
    expect(msg).toMatch(/Roster \(people\)/i);
  });

  it("guides a restricted-individual export to the 'Historical rounds' import option", () => {
    const msg = resultsLaneMismatchMessage("restricted-individual");
    expect(msg).toMatch(/restricted/i);
    expect(msg).toMatch(/Historical rounds/i);
  });

  it("guides a restricted-aggregate export to the 'Historical rounds' import option", () => {
    const msg = resultsLaneMismatchMessage("restricted-aggregate");
    expect(msg).toMatch(/restricted/i);
    expect(msg).toMatch(/Historical rounds/i);
  });

  it("never leaks the internal classifier kind vocabulary", () => {
    for (const kind of [
      "members",
      "restricted-individual",
      "restricted-aggregate",
    ] as const) {
      expect(resultsLaneMismatchMessage(kind)).not.toMatch(/got /);
    }
  });
});
