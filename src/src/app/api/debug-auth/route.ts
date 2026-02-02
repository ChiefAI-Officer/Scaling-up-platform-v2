import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
    try {
        // 1. Check Environment Variables
        const envStatus = {
            DEMO_MODE: process.env.DEMO_MODE, // Should be 'true'
            NEXTAUTH_URL: process.env.NEXTAUTH_URL,
            // Mask the secret parts
            DATABASE_URL: process.env.DATABASE_URL
                ? `${process.env.DATABASE_URL.substring(0, 15)}...${process.env.DATABASE_URL.slice(-10)}`
                : "MISSING",
            NODE_ENV: process.env.NODE_ENV,
        };

        // 2. Check Database Connection & User
        let dbStatus = "Checking...";
        let userFound = false;
        let adminEmail = "admin@scalingup.com";

        try {
            const user = await db.user.findUnique({
                where: { email: adminEmail },
                select: { id: true, email: true, role: true }
            });

            if (user) {
                dbStatus = "Connected & User Found";
                userFound = true;
            } else {
                dbStatus = "Connected but Admin User NOT Found";
            }
        } catch (dbError: any) {
            dbStatus = `Connection Failed: ${dbError.message}`;
        }

        return NextResponse.json({
            status: "Diagnostic Report",
            timestamp: new Date().toISOString(),
            environment: envStatus,
            database: {
                status: dbStatus,
                adminUserFound: userFound,
            },
        }, { status: 200 });

    } catch (error: any) {
        return NextResponse.json({
            status: "Error",
            message: error.message
        }, { status: 500 });
    }
}
