import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import {
  MARKETING_CTA_IMAGE_TYPES,
  MARKETING_CTA_MAX_IMAGE_BYTES,
  sanitizeMarketingCtaFilename,
} from "@/lib/assessments/marketing-cta-assets";
import { isPublicMarketingCtaEnabled } from "@/lib/assessments/wave-public-marketing-cta-flags";

export async function POST(request: NextRequest) {
  if (!isPublicMarketingCtaEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const actor = await getApiActor();
  if (!actor) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!isPrivilegedRole(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const templateId = form?.get("templateId");
  const file = form?.get("file");
  if (typeof templateId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "Template and image are required" }, { status: 400 });
  }
  const template = await db.assessmentTemplate.findUnique({
    where: { id: templateId },
    select: { id: true },
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  if (!MARKETING_CTA_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Use a PNG, JPEG, or WebP image" }, { status: 400 });
  }
  if (file.size > MARKETING_CTA_MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image must be 5 MB or smaller" }, { status: 400 });
  }

  const name = sanitizeMarketingCtaFilename(file.name);
  const blob = await put(
    `assessment-cta/${templateId}/${crypto.randomUUID()}-${name}`,
    file,
    { access: "public", addRandomSuffix: false },
  );
  return NextResponse.json(
    { assetRef: blob.pathname, url: blob.url },
    { status: 201 },
  );
}
