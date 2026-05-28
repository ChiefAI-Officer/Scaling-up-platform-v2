/**
 * TDD Red Phase — respondent-levels tests.
 *
 * Test matrix:
 *  (1) RESPONDENT_LEVELS has exactly 6 entries in spec order with correct values + labels
 *  (2) RESPONDENT_LEVEL_VALUES is a tuple of the 6 slugs in order
 *  (3) levelLabel returns "—" for null / undefined / empty string
 *  (4) levelLabel returns the human label for known slugs
 *  (5) levelLabel returns the raw value for unknown (legacy) slugs
 *  (6) isCEOFamily is true for the 3 CEO/Founder slugs, false for the other 3
 *  (7) isCEOFamily returns false for null / undefined / unknown
 */

import {
  RESPONDENT_LEVELS,
  RESPONDENT_LEVEL_VALUES,
  levelLabel,
  isCEOFamily,
} from "@/lib/assessments/respondent-levels";

describe("RESPONDENT_LEVELS", () => {
  test("(1) has exactly 6 entries in spec order with correct values and labels", () => {
    expect(RESPONDENT_LEVELS).toHaveLength(6);

    // Exact order + shapes
    expect(RESPONDENT_LEVELS[0]).toEqual({
      value: "teamleader",
      label: "Leadership team member",
      isCEOFamily: false,
    });
    expect(RESPONDENT_LEVELS[1]).toEqual({
      value: "employee",
      label: "Employee",
      isCEOFamily: false,
    });
    expect(RESPONDENT_LEVELS[2]).toEqual({
      value: "guest",
      label: "Guest",
      isCEOFamily: false,
    });
    expect(RESPONDENT_LEVELS[3]).toEqual({
      value: "ceofounderwithteam",
      label: "CEO/Founder with team",
      isCEOFamily: true,
    });
    expect(RESPONDENT_LEVELS[4]).toEqual({
      value: "ceofounderalone",
      label: "CEO/Founder alone",
      isCEOFamily: true,
    });
    expect(RESPONDENT_LEVELS[5]).toEqual({
      value: "ceofounder",
      label: "CEO/Founder",
      isCEOFamily: true,
    });
  });

  test("(2) RESPONDENT_LEVEL_VALUES is a tuple of all 6 slugs in order", () => {
    expect(RESPONDENT_LEVEL_VALUES).toEqual([
      "teamleader",
      "employee",
      "guest",
      "ceofounderwithteam",
      "ceofounderalone",
      "ceofounder",
    ]);
    // Must be non-empty tuple (first element present — needed for z.enum)
    expect(RESPONDENT_LEVEL_VALUES.length).toBe(6);
  });
});

describe("levelLabel", () => {
  test("(3a) returns '—' for null", () => {
    expect(levelLabel(null)).toBe("—");
  });

  test("(3b) returns '—' for undefined", () => {
    expect(levelLabel(undefined)).toBe("—");
  });

  test("(3c) returns '—' for empty string", () => {
    expect(levelLabel("")).toBe("—");
  });

  test("(4a) returns 'Leadership team member' for 'teamleader'", () => {
    expect(levelLabel("teamleader")).toBe("Leadership team member");
  });

  test("(4b) returns 'Employee' for 'employee'", () => {
    expect(levelLabel("employee")).toBe("Employee");
  });

  test("(4c) returns 'Guest' for 'guest'", () => {
    expect(levelLabel("guest")).toBe("Guest");
  });

  test("(4d) returns 'CEO/Founder with team' for 'ceofounderwithteam'", () => {
    expect(levelLabel("ceofounderwithteam")).toBe("CEO/Founder with team");
  });

  test("(4e) returns 'CEO/Founder alone' for 'ceofounderalone'", () => {
    expect(levelLabel("ceofounderalone")).toBe("CEO/Founder alone");
  });

  test("(4f) returns 'CEO/Founder' for 'ceofounder'", () => {
    expect(levelLabel("ceofounder")).toBe("CEO/Founder");
  });

  test("(5a) returns the raw value for an unknown legacy slug", () => {
    expect(levelLabel("senior_manager")).toBe("senior_manager");
  });

  test("(5b) returns the raw value for another unknown slug", () => {
    expect(levelLabel("EXECUTIVE")).toBe("EXECUTIVE");
  });
});

describe("isCEOFamily", () => {
  test("(6a) returns true for 'ceofounderwithteam'", () => {
    expect(isCEOFamily("ceofounderwithteam")).toBe(true);
  });

  test("(6b) returns true for 'ceofounderalone'", () => {
    expect(isCEOFamily("ceofounderalone")).toBe(true);
  });

  test("(6c) returns true for 'ceofounder'", () => {
    expect(isCEOFamily("ceofounder")).toBe(true);
  });

  test("(6d) returns false for 'teamleader'", () => {
    expect(isCEOFamily("teamleader")).toBe(false);
  });

  test("(6e) returns false for 'employee'", () => {
    expect(isCEOFamily("employee")).toBe(false);
  });

  test("(6f) returns false for 'guest'", () => {
    expect(isCEOFamily("guest")).toBe(false);
  });

  test("(7a) returns false for null", () => {
    expect(isCEOFamily(null)).toBe(false);
  });

  test("(7b) returns false for undefined", () => {
    expect(isCEOFamily(undefined)).toBe(false);
  });

  test("(7c) returns false for an unknown slug", () => {
    expect(isCEOFamily("super_admin")).toBe(false);
  });
});
