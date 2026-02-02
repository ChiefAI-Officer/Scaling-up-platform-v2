import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
    const report: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
    };

    // 1. Environment Variable Check
    report.environment = {
        DEMO_MODE: process.env.DEMO_MODE ?? "(not set)",
        DEMO_MODE_IS_TRUE: process.env.DEMO_MODE === "true",
        NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "(not set)",
        NEXTAUTH_SECRET_EXISTS: !!process.env.NEXTAUTH_SECRET,
        DATABASE_URL_PATTERN: process.env.DATABASE_URL
            ? `${process.env.DATABASE_URL.substring(0, 20)}...${process.env.DATABASE_URL.slice(-15)}`
            : "(MISSING!)",
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
