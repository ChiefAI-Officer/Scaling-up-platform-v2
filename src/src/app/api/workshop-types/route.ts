import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createWorkshopTypeSchema } from "@/lib/validations";

export async function GET() {
  try {
    const workshopTypes = await db.workshopType.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    // Parse JSON fields before returning
    const parsed = workshopTypes.map((wt) => ({
      ...wt,
      durationOptions: wt.durationOptions ? JSON.parse(wt.durationOptions) : [],
      materials: wt.materials ? JSON.parse(wt.materials) : null,
      marketingTemplates: wt.marketingTemplates ? JSON.parse(wt.marketingTemplates) : null,
      pricingTiers: wt.pricingTiers ? JSON.parse(wt.pricingTiers) : null,
    }));

    return NextResponse.json({
      success: true,
      data: parsed,
    });
  } catch (error) {
    console.error("Error fetching workshop types:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch workshop types" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = createWorkshopTypeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Check for duplicate slug
    const existing = await db.workshopType.findUnique({
      where: { slug: data.slug },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "A workshop type with this slug already exists" },
        { status: 400 }
      );
    }

    const workshopType = await db.workshopType.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        shortDescription: data.shortDescription,
        durationOptions: JSON.stringify(data.durationOptions),
        materials: data.materials ? JSON.stringify(data.materials) : null,
        marketingTemplates: data.marketingTemplates ? JSON.stringify(data.marketingTemplates) : null,
        pricingTiers: data.pricingTiers ? JSON.stringify(data.pricingTiers) : null,
        preWorkshopInstructions: data.preWorkshopInstructions,
        isActive: data.isActive,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: workshopType,
        message: "Workshop type created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating workshop type:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create workshop type" },
      { status: 500 }
    );
  }
}
