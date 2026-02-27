import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { getAuthPosture } from "@/lib/auth-posture";

export async function GET() {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const actor = await getApiActor();
    if (!actor) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!isPrivilegedRole(actor.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const report: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
    };
    const posture = getAuthPosture();

    // 1. Environment Variable Check
    report.environment = {
        DEMO_MODE: process.env.DEMO_MODE ?? "(not set)",
        DEMO_MODE_IS_TRUE: posture.configuredDemoMode,
        DEMO_MODE_EFFECTIVE: posture.effectiveDemoMode,
        DEMO_MODE_BLOCKED_BY_GUARD: posture.guardViolation,
        DEPLOYMENT_CONTEXT: posture.deploymentContext,
        NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "(not set)",
        NEXTAUTH_SECRET_EXISTS: !!process.env.NEXTAUTH_SECRET,
        DATABASE_URL_EXISTS: !!process.env.DATABASE_URL,
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV ?? "(not set)",
    };

    // 2. Database Connection Check
    try {
        // Exact same query as auth.ts
        const adminUser = await db.user.findUnique({
            where: { email: "admin@scalingup.com" },
            select: { id: true, email: true, role: true },
        });

        if (adminUser) {
            report.database = {
                status: "✅ CONNECTED",
                adminUserFound: true,
                userId: adminUser.id,
                userEmail: adminUser.email,
                userRole: adminUser.role,
            };
        } else {
            report.database = {
                status: "⚠️ Connected but admin@scalingup.com NOT FOUND",
                adminUserFound: false,
                suggestion: "Run 'npx tsx prisma/seed.ts' or 'npx prisma db seed' to create the user.",
            };
        }
    } catch (dbError: unknown) {
        const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
        report.database = {
            status: "❌ CONNECTION FAILED",
            error: errorMessage,
        };
    }

    // 3. Auth Logic Simulation
    report.authLogicSimulation = {
        wouldDemoModeAllow_demo123:
            posture.effectiveDemoMode
                ? "YES (local development only)"
                : posture.configuredDemoMode
                  ? "NO (blocked by P0-SEC-03 guard outside local development)"
                  : "NO (DEMO_MODE is not enabled)",
    };

    return NextResponse.json(report, { status: 200 });
}
