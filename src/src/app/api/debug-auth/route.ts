import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";

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

    // 1. Environment Variable Check
    report.environment = {
        DEMO_MODE: process.env.DEMO_MODE ?? "(not set)",
        DEMO_MODE_IS_TRUE: process.env.DEMO_MODE === "true",
        NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "(not set)",
        NEXTAUTH_SECRET_EXISTS: !!process.env.NEXTAUTH_SECRET,
        DATABASE_URL_EXISTS: !!process.env.DATABASE_URL,
        NODE_ENV: process.env.NODE_ENV,
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
            process.env.DEMO_MODE === "true" ? "YES" : "NO (DEMO_MODE is not 'true')",
    };

    return NextResponse.json(report, { status: 200 });
}
