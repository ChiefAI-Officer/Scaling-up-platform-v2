import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/files/terms-and-conditions
 * MR-02: Stable URL for the SUN Workshop Terms & Conditions PDF.
 * Looks up the most recently uploaded file matching "terms and conditions"
 * in the file manager and redirects to its blob URL.
 * Admins can replace the file in the file manager without breaking this link.
 */
export async function GET() {
    const file = await db.fileAttachment.findFirst({
        where: {
            OR: [
                { filename: { contains: "terms", mode: "insensitive" } },
                { filename: { contains: "Terms", mode: "insensitive" } },
            ],
            contentType: { contains: "pdf" },
        },
        orderBy: { createdAt: "desc" },
        select: { blobUrl: true, filename: true },
    });

    if (!file) {
        return new NextResponse(
            "Terms and Conditions file not found. Please upload the file in the File Manager.",
            { status: 404, headers: { "Content-Type": "text/plain" } }
        );
    }

    return NextResponse.redirect(file.blobUrl, { status: 302 });
}
