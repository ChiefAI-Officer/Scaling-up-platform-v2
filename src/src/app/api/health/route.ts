import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthPosture } from "@/lib/auth-posture";

/**
 * Health check endpoint for monitoring and load balancers
 */
export async function GET() {
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    checks: {
      database: "unknown",
      authPosture: "unknown",
      uptime: process.uptime(),
    },
  };

  try {
    // Check database connection
    await db.$queryRaw`SELECT 1`;
    health.checks.database = "healthy";
  } catch (error) {
    health.status = "unhealthy";
    health.checks.database = "unhealthy";
    console.error("Health check - database error:", error);
  }

  const authPosture = getAuthPosture();
  if (authPosture.guardViolation) {
    health.status = "unhealthy";
    health.checks.authPosture = "unsafe-demo-mode-config";
    console.error(
      `[SECURITY][P0-SEC-03][HEALTH] DEMO_MODE=true is set in ${authPosture.deploymentContext}; local-only demo auth guard is active.`
    );
  } else {
    health.checks.authPosture = "safe";
  }

  const statusCode = health.status === "healthy" ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}
