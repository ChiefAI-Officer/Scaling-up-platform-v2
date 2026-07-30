import {
  resolvePublicLeadsState,
  type PublicLeadsEnv,
} from "@/lib/assessments/public-leads-state";

const READY: PublicLeadsEnv = {
  WAVE_PUBLIC_LEADS_ENABLED: "1",
  WAVE_PUBLIC_LEADS_KILL: "0",
  WAVE_PUBLIC_LEADS_CANARY_COACH_IDS: "",
  PUBLIC_LEADS_POLICY_APPROVED: "1",
  PUBLIC_LEADS_POLICY_VERSION: "2026-07",
  PUBLIC_LEADS_RETENTION_DAYS: "365",
  PUBLIC_LEADS_DELETION_MODE: "ANONYMIZE",
  PUBLIC_LEADS_DISTRIBUTED_LIMITER_READY: "1",
  PUBLIC_LEADS_REFERRAL_KEYS_ISSUED: "0",
};

describe("resolvePublicLeadsState", () => {
  it("is legacy and presentation-off by default", () => {
    expect(resolvePublicLeadsState({}, { coachId: "coach-1" })).toEqual(
      expect.objectContaining({
        mode: "PRE_ISSUANCE_OFF",
        captureOwnership: false,
        parseReferralKeys: false,
        presentationEnabled: false,
        legacyDelivery: true,
      }),
    );
  });

  it("enables the new contract only when feature, policy, and limiter are ready", () => {
    expect(resolvePublicLeadsState(READY, { coachId: "coach-1" })).toEqual(
      expect.objectContaining({
        mode: "ON",
        captureOwnership: true,
        parseReferralKeys: true,
        presentationEnabled: true,
        legacyDelivery: false,
        policyVersion: "2026-07",
      }),
    );
  });

  it("limits canary mode to configured coach IDs", () => {
    const env = {
      ...READY,
      WAVE_PUBLIC_LEADS_ENABLED: "0",
      WAVE_PUBLIC_LEADS_CANARY_COACH_IDS: "coach-1, coach-2",
    };
    expect(resolvePublicLeadsState(env, { coachId: "coach-1" }).mode).toBe(
      "CANARY",
    );
    expect(resolvePublicLeadsState(env, { coachId: "coach-3" }).mode).toBe(
      "PRE_ISSUANCE_OFF",
    );
  });

  it("fails closed to Scaling Up-owned when policy is unavailable", () => {
    const state = resolvePublicLeadsState(
      { ...READY, PUBLIC_LEADS_POLICY_APPROVED: "0" },
      { coachId: "coach-1" },
    );
    expect(state).toEqual(
      expect.objectContaining({
        mode: "POLICY_UNAVAILABLE",
        captureOwnership: false,
        presentationEnabled: false,
        legacyDelivery: false,
      }),
    );
  });

  it("forfeits ownership when the distributed limiter is unavailable", () => {
    const state = resolvePublicLeadsState(
      { ...READY, PUBLIC_LEADS_DISTRIBUTED_LIMITER_READY: "0" },
      { coachId: "coach-1" },
    );
    expect(state).toEqual(
      expect.objectContaining({
        mode: "LIMITER_UNAVAILABLE",
        captureOwnership: false,
        holdTakerAndTeamMail: true,
        legacyDelivery: false,
      }),
    );
  });

  it("keeps parsing issued keys under kill while suppressing presentation and coach mail", () => {
    const state = resolvePublicLeadsState(
      {
        ...READY,
        WAVE_PUBLIC_LEADS_KILL: "1",
        PUBLIC_LEADS_REFERRAL_KEYS_ISSUED: "1",
      },
      { coachId: "coach-1" },
    );
    expect(state).toEqual(
      expect.objectContaining({
        mode: "POST_ISSUANCE_KILL",
        parseReferralKeys: true,
        captureOwnership: true,
        presentationEnabled: false,
        sendCoachNotification: false,
      }),
    );
  });

  it("treats kill before any key issuance as legacy pre-wave behavior", () => {
    const state = resolvePublicLeadsState(
      { ...READY, WAVE_PUBLIC_LEADS_KILL: "1" },
      { coachId: "coach-1" },
    );
    expect(state.mode).toBe("PRE_ISSUANCE_KILL");
    expect(state.parseReferralKeys).toBe(false);
    expect(state.captureOwnership).toBe(false);
    expect(state.legacyDelivery).toBe(true);
  });
});
