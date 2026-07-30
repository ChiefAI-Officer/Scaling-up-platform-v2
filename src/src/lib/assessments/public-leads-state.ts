export interface PublicLeadsEnv {
  [key: string]: string | undefined;
  WAVE_PUBLIC_LEADS_ENABLED?: string;
  WAVE_PUBLIC_LEADS_KILL?: string;
  WAVE_PUBLIC_LEADS_CANARY_COACH_IDS?: string;
  PUBLIC_LEADS_POLICY_APPROVED?: string;
  PUBLIC_LEADS_POLICY_VERSION?: string;
  PUBLIC_LEADS_RETENTION_DAYS?: string;
  PUBLIC_LEADS_DELETION_MODE?: string;
  PUBLIC_LEADS_DISTRIBUTED_LIMITER_READY?: string;
  PUBLIC_LEADS_REFERRAL_KEYS_ISSUED?: string;
}

export type PublicLeadsMode =
  | "PRE_ISSUANCE_OFF"
  | "PRE_ISSUANCE_KILL"
  | "CANARY"
  | "ON"
  | "POST_ISSUANCE_KILL"
  | "POLICY_UNAVAILABLE"
  | "LIMITER_UNAVAILABLE";

export interface PublicLeadsState {
  mode: PublicLeadsMode;
  parseReferralKeys: boolean;
  captureOwnership: boolean;
  presentationEnabled: boolean;
  sendCoachNotification: boolean;
  holdTakerAndTeamMail: boolean;
  legacyDelivery: boolean;
  policyVersion: string | null;
  retentionDays: number | null;
  deletionMode: "ANONYMIZE" | "DELETE" | null;
}

export function publicLeadRetentionCutoff(
  state: Pick<PublicLeadsState, "retentionDays">,
  now = new Date(),
): Date | null {
  if (state.retentionDays === null) return null;
  return new Date(
    now.getTime() - state.retentionDays * 24 * 60 * 60 * 1_000,
  );
}

function enabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function canarySet(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function resolvePolicy(env: PublicLeadsEnv): Pick<
  PublicLeadsState,
  "policyVersion" | "retentionDays" | "deletionMode"
> & { ready: boolean } {
  const policyVersion = env.PUBLIC_LEADS_POLICY_VERSION?.trim() || null;
  const retentionDays = Number(env.PUBLIC_LEADS_RETENTION_DAYS);
  const deletionMode =
    env.PUBLIC_LEADS_DELETION_MODE === "ANONYMIZE" ||
    env.PUBLIC_LEADS_DELETION_MODE === "DELETE"
      ? env.PUBLIC_LEADS_DELETION_MODE
      : null;
  const ready =
    enabled(env.PUBLIC_LEADS_POLICY_APPROVED) &&
    policyVersion !== null &&
    Number.isSafeInteger(retentionDays) &&
    retentionDays > 0 &&
    deletionMode !== null;

  return {
    ready,
    policyVersion,
    retentionDays: ready ? retentionDays : null,
    deletionMode,
  };
}

export function resolvePublicLeadsState(
  env: PublicLeadsEnv = process.env,
  input: { coachId: string | null },
): PublicLeadsState {
  const globallyEnabled = enabled(env.WAVE_PUBLIC_LEADS_ENABLED);
  const kill = enabled(env.WAVE_PUBLIC_LEADS_KILL);
  const issued = enabled(env.PUBLIC_LEADS_REFERRAL_KEYS_ISSUED);
  const canaries = canarySet(env.WAVE_PUBLIC_LEADS_CANARY_COACH_IDS);
  const canaryHit = input.coachId !== null && canaries.has(input.coachId);
  const featureRequested = globallyEnabled || canaryHit;
  const policy = resolvePolicy(env);

  const base = {
    policyVersion: policy.ready ? policy.policyVersion : null,
    retentionDays: policy.retentionDays,
    deletionMode: policy.deletionMode,
  };

  if (!featureRequested && !issued) {
    return {
      mode: kill ? "PRE_ISSUANCE_KILL" : "PRE_ISSUANCE_OFF",
      parseReferralKeys: false,
      captureOwnership: false,
      presentationEnabled: false,
      sendCoachNotification: false,
      holdTakerAndTeamMail: false,
      legacyDelivery: true,
      ...base,
    };
  }

  if (kill && !issued) {
    return {
      mode: "PRE_ISSUANCE_KILL",
      parseReferralKeys: false,
      captureOwnership: false,
      presentationEnabled: false,
      sendCoachNotification: false,
      holdTakerAndTeamMail: false,
      legacyDelivery: true,
      ...base,
    };
  }

  if (!policy.ready) {
    return {
      mode: "POLICY_UNAVAILABLE",
      parseReferralKeys: issued || featureRequested,
      captureOwnership: false,
      presentationEnabled: false,
      sendCoachNotification: false,
      holdTakerAndTeamMail: false,
      legacyDelivery: false,
      ...base,
    };
  }

  if (!enabled(env.PUBLIC_LEADS_DISTRIBUTED_LIMITER_READY)) {
    return {
      mode: "LIMITER_UNAVAILABLE",
      parseReferralKeys: issued || featureRequested,
      captureOwnership: false,
      presentationEnabled: false,
      sendCoachNotification: false,
      holdTakerAndTeamMail: true,
      legacyDelivery: false,
      ...base,
    };
  }

  if (kill || (!featureRequested && issued)) {
    return {
      mode: "POST_ISSUANCE_KILL",
      parseReferralKeys: true,
      captureOwnership: true,
      presentationEnabled: false,
      sendCoachNotification: false,
      holdTakerAndTeamMail: false,
      legacyDelivery: false,
      ...base,
    };
  }

  return {
    mode: canaryHit && !globallyEnabled ? "CANARY" : "ON",
    parseReferralKeys: true,
    captureOwnership: true,
    presentationEnabled: true,
    sendCoachNotification: true,
    holdTakerAndTeamMail: false,
    legacyDelivery: false,
    ...base,
  };
}
