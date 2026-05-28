/**
 * Tests for the snapshot classification + connection-error helpers.
 *
 * These exist because a transient Neon cold-start drop on the first findMany
 * once left the User table out of a snapshot, yet the script still wrote a
 * normal-looking file and a complete-snapshot was assumed. The classifier
 * guarantees a partial snapshot is never named like a complete one, and that a
 * missing CORE table (User/Coach/Survey/...) is a hard (exit 1) failure.
 */

import {
  isConnectionError,
  classifySnapshot,
} from "../../scripts/snapshot-prod-helpers.mjs";

describe("isConnectionError", () => {
  test("true for Neon 'Can't reach database server'", () => {
    expect(
      isConnectionError(
        "Can't reach database server at `ep-falling-sound.neon.tech:5432`",
      ),
    ).toBe(true);
  });

  test("true for Prisma P1001", () => {
    expect(isConnectionError("Error P1001: connection refused")).toBe(true);
  });

  test("false for a non-connection error", () => {
    expect(isConnectionError("Unique constraint failed on the fields: (`id`)")).toBe(false);
  });

  test("false for empty / undefined", () => {
    expect(isConnectionError(undefined)).toBe(false);
    expect(isConnectionError("")).toBe(false);
  });
});

describe("classifySnapshot", () => {
  const CORE = ["User", "Coach", "Survey", "SurveyTemplate", "Workflow"];

  test("no errors → complete snapshot, exit 0, no suffix", () => {
    const r = classifySnapshot([], CORE);
    expect(r.partial).toBe(false);
    expect(r.severe).toBe(false);
    expect(r.exitCode).toBe(0);
    expect(r.filenameSuffix).toBe("");
  });

  test("a non-core table failed → partial, exit 2, .PARTIAL suffix", () => {
    const r = classifySnapshot(["WorkflowStepExecution"], CORE);
    expect(r.partial).toBe(true);
    expect(r.severe).toBe(false);
    expect(r.exitCode).toBe(2);
    expect(r.filenameSuffix).toBe(".PARTIAL");
  });

  test("a CORE table failed → severe, exit 1, .PARTIAL suffix, lists coreFailed", () => {
    const r = classifySnapshot(["User"], CORE);
    expect(r.partial).toBe(true);
    expect(r.severe).toBe(true);
    expect(r.exitCode).toBe(1);
    expect(r.filenameSuffix).toBe(".PARTIAL");
    expect(r.coreFailed).toEqual(["User"]);
  });
});
