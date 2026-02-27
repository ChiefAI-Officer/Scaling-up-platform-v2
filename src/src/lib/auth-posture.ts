type GuardContext = "startup" | "runtime";

export interface AuthPosture {
  configuredDemoMode: boolean;
  effectiveDemoMode: boolean;
  guardViolation: boolean;
  isLocalDevelopment: boolean;
  deploymentContext: string;
  nodeEnv: string;
  vercelEnv: string;
}

let startupViolationLogged = false;
let runtimeViolationLogged = false;
let localDemoModeLogged = false;

function isTrue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

function resolveDeploymentContext(nodeEnv: string, vercelEnv: string): string {
  if (nodeEnv === "development" && !vercelEnv) {
    return "local-development";
  }
  if (vercelEnv === "preview") {
    return "vercel-preview";
  }
  if (vercelEnv === "production") {
    return "vercel-production";
  }
  if (nodeEnv === "production") {
    return "production";
  }
  return nodeEnv || "unknown";
}

export function resolveAuthPosture(env: NodeJS.ProcessEnv): AuthPosture {
  const nodeEnv = env.NODE_ENV || "development";
  const vercelEnv = (env.VERCEL_ENV || "").trim().toLowerCase();
  const configuredDemoMode = isTrue(env.DEMO_MODE);
  const isLocalDevelopment = nodeEnv === "development" && !vercelEnv;
  const effectiveDemoMode = configuredDemoMode && isLocalDevelopment;
  const guardViolation = configuredDemoMode && !isLocalDevelopment;

  return {
    configuredDemoMode,
    effectiveDemoMode,
    guardViolation,
    isLocalDevelopment,
    deploymentContext: resolveDeploymentContext(nodeEnv, vercelEnv),
    nodeEnv,
    vercelEnv: vercelEnv || "(not set)",
  };
}

export function getAuthPosture(): AuthPosture {
  return resolveAuthPosture(process.env);
}

function logViolation(posture: AuthPosture, context: GuardContext): void {
  console.error(
    `[SECURITY][P0-SEC-03][AUTH] DEMO_MODE=true detected in ${posture.deploymentContext} during ${context}; ` +
      "demo authentication is forcibly disabled outside local development."
  );
}

function logLocalDemoMode(posture: AuthPosture): void {
  console.warn(
    `[SECURITY][P0-SEC-03][AUTH] DEMO_MODE enabled in ${posture.deploymentContext}; ` +
      "local-only demo authentication is active."
  );
}

export function enforceProductionSafeAuthPosture(context: GuardContext): AuthPosture {
  const posture = getAuthPosture();

  if (posture.guardViolation) {
    if (context === "startup" && !startupViolationLogged) {
      logViolation(posture, context);
      startupViolationLogged = true;
    }
    if (context === "runtime" && !runtimeViolationLogged) {
      logViolation(posture, context);
      runtimeViolationLogged = true;
    }
    return posture;
  }

  if (posture.effectiveDemoMode && context === "startup" && !localDemoModeLogged) {
    logLocalDemoMode(posture);
    localDemoModeLogged = true;
  }

  return posture;
}
