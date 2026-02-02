import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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

  const statusCode = health.status === "healthy" ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}
