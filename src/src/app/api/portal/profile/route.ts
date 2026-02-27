import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

const updatePortalProfileSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    bio: z.string().optional(),
    linkedinUrl: z.string().url().nullable().optional(),
    showBookCallCta: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "At least one field must be provided",
  });

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const coach = await db.coach.findUnique({
      where: { email: session.user.email },
    });

    if (!coach) {
      return NextResponse.json({ success: false, error: "Coach profile not found" }, { status: 404 });
    }

    const bodyValidation = updatePortalProfileSchema.safeParse(await request.json());
    if (!bodyValidation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body", details: bodyValidation.error.issues },
        { status: 400 }
      );
    }

    const { firstName, lastName, bio, linkedinUrl, showBookCallCta } = bodyValidation.data;

    const updated = await db.coach.update({
      where: { id: coach.id },
      data: {
        ...(typeof firstName === "string" && { firstName: firstName.trim() }),
        ...(typeof lastName === "string" && { lastName: lastName.trim() }),
        ...(typeof bio === "string" && { bio: bio.trim() }),
        ...(linkedinUrl !== undefined && { linkedinUrl }),
        ...(typeof showBookCallCta === "boolean" && { showBookCallCta }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating coach profile:", error);
    return NextResponse.json({ success: false, error: "Failed to update profile" }, { status: 500 });
  }
}
