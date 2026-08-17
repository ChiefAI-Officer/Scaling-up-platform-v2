import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * POST /api/portal/profile/image
 * Upload a profile image for the currently logged-in coach.
 * Uses Vercel Blob for storage.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (!actor.coachId) {
      return NextResponse.json({ success: false, error: "Coach profile not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "File must be JPEG, PNG, or WebP" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "File must be under 5 MB" },
        { status: 400 }
      );
    }

    // Upload to Vercel Blob
    const blob = await put(`coach-profiles/${actor.coachId}-${Date.now()}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    // Update coach record
    await db.coach.update({
      where: { id: actor.coachId },
      data: { profileImage: blob.url },
    });

    return NextResponse.json({ success: true, url: blob.url });
  } catch (error) {
    console.error("Error uploading profile image:", error);
    return NextResponse.json(
      { success: false, error: "Failed to upload image" },
      { status: 500 }
    );
  }
}
