/**
 * Assessment v7.6 — Canonical certification constant.
 *
 * Spec ref: docs/specs/v7.6/02-service-layer-rules.md → "Canonical
 * certification constant (Round 3 H-2)". The existing platform uses
 * `certificationStatus="ACTIVE"` for certified coaches (NOT "CERTIFIED").
 * A canonical constant prevents drift between the service layer, admin
 * UI, and post-deploy verification scripts.
 */

import {
  CERTIFIED_STATUS,
  PENDING_STATUS,
  DEACTIVATED_STATUS,
  isCertified,
} from "@/lib/auth/coach-status";

describe("coach-status constants", () => {
  it("CERTIFIED_STATUS is 'ACTIVE' (not 'CERTIFIED')", () => {
    expect(CERTIFIED_STATUS).toBe("ACTIVE");
  });

  it("PENDING_STATUS is 'PENDING'", () => {
    expect(PENDING_STATUS).toBe("PENDING");
  });

  it("DEACTIVATED_STATUS is 'DEACTIVATED'", () => {
    expect(DEACTIVATED_STATUS).toBe("DEACTIVATED");
  });
});

describe("isCertified", () => {
  it("returns true when certificationStatus is ACTIVE", () => {
    expect(isCertified({ certificationStatus: "ACTIVE" })).toBe(true);
  });

  it("returns false when certificationStatus is PENDING", () => {
    expect(isCertified({ certificationStatus: "PENDING" })).toBe(false);
  });

  it("returns false when certificationStatus is DEACTIVATED", () => {
    expect(isCertified({ certificationStatus: "DEACTIVATED" })).toBe(false);
  });

  it("returns false when certificationStatus is DENIED", () => {
    expect(isCertified({ certificationStatus: "DENIED" })).toBe(false);
  });

  it("returns false when certificationStatus is EXPIRED", () => {
    expect(isCertified({ certificationStatus: "EXPIRED" })).toBe(false);
  });

  it("returns false on unknown status values (defensive)", () => {
    expect(isCertified({ certificationStatus: "SOMETHING_NEW" })).toBe(false);
  });

  it("never falls back to 'CERTIFIED' literal (regression guard)", () => {
    // The pre-v7.6 spec mistakenly assumed the constant was "CERTIFIED".
    // If anyone ever flips back, this test catches the drift.
    expect(isCertified({ certificationStatus: "CERTIFIED" })).toBe(false);
  });
});
