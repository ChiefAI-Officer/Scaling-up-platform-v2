import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";

const PARTNER_PROFILE_DRAFT_KEY = "system:partners:profiles";
const PARTNER_TOGGLE_DRAFT_KEY = "system:partners:toggles";

const partnerSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Partner name is required"),
  tagline: z.string().trim().default(""),
  description: z.string().trim().default(""),
  logoUrl: z.string().trim().default(""),
  isActive: z.boolean().default(true),
});

const partnerToggleSchema = z.object({
  partnerId: z.string().min(1, "Partner is required"),
  workshopId: z.string().min(1, "Workshop is required"),
  enabled: z.boolean(),
});

interface PartnerProfile {
  id: string;
  name: string;
  tagline: string;
  description: string;
  logoUrl: string;
  isActive: boolean;
  updatedAt: string;
}

interface PartnerToggle {
  partnerId: string;
  workshopId: string;
  enabled: boolean;
  updatedAt: string;
}

function parsePartnerProfiles(raw: string): PartnerProfile[] {
  try {
    const parsed = JSON.parse(raw) as { partners?: Array<Partial<PartnerProfile>> };
    if (!Array.isArray(parsed.partners)) {
      return [];
    }

    return parsed.partners.map((partner) => ({
      id: String(partner.id || ""),
      name: String(partner.name || ""),
      tagline: String(partner.tagline || ""),
      description: String(partner.description || ""),
      logoUrl: String(partner.logoUrl || ""),
      isActive: partner.isActive !== false,
      updatedAt: String(partner.updatedAt || new Date().toISOString()),
    }));
  } catch {
    return [];
  }
}

function parsePartnerToggles(raw: string): PartnerToggle[] {
  try {
    const parsed = JSON.parse(raw) as { toggles?: PartnerToggle[] };
    return Array.isArray(parsed.toggles) ? parsed.toggles : [];
  } catch {
    return [];
  }
}

async function getDraftByKey(key: string) {
  return db.workshopDraft.findFirst({
    where: { userId: key },
    orderBy: { updatedAt: "desc" },
  });
}

async function saveDraft(key: string, payload: unknown) {
  const existing = await getDraftByKey(key);
  const serialized = JSON.stringify(payload);

  if (existing) {
    await db.workshopDraft.update({
      where: { id: existing.id },
      data: {
        currentStep: 1,
        stepsData: serialized,
        lastSavedAt: new Date(),
      },
    });
    return;
  }

  await db.workshopDraft.create({
    data: {
      userId: key,
      currentStep: 1,
      stepsData: serialized,
      workshopId: null,
    },
  });
}

async function requirePrivilegedActor() {
  const actor = await getApiActor();
  if (!actor) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 }) };
  }
  if (!isPrivilegedRole(actor.role)) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const, actor };
}

export async function GET() {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const [profilesDraft, togglesDraft, workshops] = await Promise.all([
      getDraftByKey(PARTNER_PROFILE_DRAFT_KEY),
      getDraftByKey(PARTNER_TOGGLE_DRAFT_KEY),
      db.workshop.findMany({
        select: { id: true, title: true, eventDate: true },
        orderBy: { eventDate: "desc" },
        take: 100,
      }),
    ]);

    const partners = profilesDraft ? parsePartnerProfiles(profilesDraft.stepsData) : [];
    const toggles = togglesDraft ? parsePartnerToggles(togglesDraft.stepsData) : [];

    return NextResponse.json({
      success: true,
      data: {
        partners,
        toggles,
        workshops,
      },
    });
  } catch (error) {
    console.error("Failed to load partners data:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load partners data" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePrivilegedActor();
    if (!auth.ok) {
      return auth.response;
    }

    const body = await request.json();
    const payload = partnerSchema.parse(body);

    const existingDraft = await getDraftByKey(PARTNER_PROFILE_DRAFT_KEY);
    const existingPartners = existingDraft ? parsePartnerProfiles(existingDraft.stepsData) : [];

    const id = payload.id || randomUUID();
    const now = new Date().toISOString();

    const updatedPartners = (() => {
      const existing = existingPartners.find((partner) => partner.id === id);
      if (existing) {
        return existingPartners.map((partner) =>
          partner.id === id
            ? {
                ...partner,
                name: payload.name,
                tagline: payload.tagline,
                description: payload.description,
                logoUrl: payload.logoUrl,
                isActive: payload.isActive,
                updatedAt: now,
              }
            : partner
        );
      }

      return [
        ...existingPartners,
        {
          id,
          name: payload.name,
          tagline: payload.tagline,
          description: payload.description,
          logoUrl: payload.logoUrl,
          isActive: payload.isActive,
          updatedAt: now,
        },
      ];
    })();

    await saveDraft(PARTNER_PROFILE_DRAFT_KEY, { partners: updatedPartners });

    return NextResponse.json({
      success: true,
      data: { id },
      message: "Partner profile saved",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues },
        { status: 400 }
      );
    }

    console.error("Failed to save partner profile:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save partner profile" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requirePrivilegedActor();
    if (!auth.ok) {
      return auth.response;
    }

    const body = await request.json();

    if (body.type === "partner-active") {
      const id = typeof body.id === "string" ? body.id : "";
      const isActive = body.isActive === true;

      if (!id) {
        return NextResponse.json(
          { success: false, error: "Partner ID is required" },
          { status: 400 }
        );
      }

      const existingDraft = await getDraftByKey(PARTNER_PROFILE_DRAFT_KEY);
      const existingPartners = existingDraft ? parsePartnerProfiles(existingDraft.stepsData) : [];

      const updatedPartners = existingPartners.map((partner) =>
        partner.id === id
          ? { ...partner, isActive, updatedAt: new Date().toISOString() }
          : partner
      );

      await saveDraft(PARTNER_PROFILE_DRAFT_KEY, { partners: updatedPartners });

      return NextResponse.json({ success: true, message: "Partner status updated" });
    }

    if (body.type === "workshop-toggle") {
      const payload = partnerToggleSchema.parse(body);
      const now = new Date().toISOString();

      const toggleDraft = await getDraftByKey(PARTNER_TOGGLE_DRAFT_KEY);
      const existingToggles = toggleDraft ? parsePartnerToggles(toggleDraft.stepsData) : [];

      const nextToggles = (() => {
        const existing = existingToggles.find(
          (toggle) =>
            toggle.partnerId === payload.partnerId && toggle.workshopId === payload.workshopId
        );

        if (existing) {
          return existingToggles.map((toggle) =>
            toggle.partnerId === payload.partnerId && toggle.workshopId === payload.workshopId
              ? { ...toggle, enabled: payload.enabled, updatedAt: now }
              : toggle
          );
        }

        return [
          ...existingToggles,
          {
            partnerId: payload.partnerId,
            workshopId: payload.workshopId,
            enabled: payload.enabled,
            updatedAt: now,
          },
        ];
      })();

      await saveDraft(PARTNER_TOGGLE_DRAFT_KEY, { toggles: nextToggles });

      return NextResponse.json({ success: true, message: "Workshop partner toggle saved" });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported patch operation" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues },
        { status: 400 }
      );
    }

    console.error("Failed to update partners data:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update partners data" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requirePrivilegedActor();
    if (!auth.ok) {
      return auth.response;
    }

    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Partner ID is required" },
        { status: 400 }
      );
    }

    const [profileDraft, toggleDraft] = await Promise.all([
      getDraftByKey(PARTNER_PROFILE_DRAFT_KEY),
      getDraftByKey(PARTNER_TOGGLE_DRAFT_KEY),
    ]);

    const existingPartners = profileDraft ? parsePartnerProfiles(profileDraft.stepsData) : [];
    const existingToggles = toggleDraft ? parsePartnerToggles(toggleDraft.stepsData) : [];

    const nextPartners = existingPartners.filter((partner) => partner.id !== id);
    const nextToggles = existingToggles.filter((toggle) => toggle.partnerId !== id);

    await Promise.all([
      saveDraft(PARTNER_PROFILE_DRAFT_KEY, { partners: nextPartners }),
      saveDraft(PARTNER_TOGGLE_DRAFT_KEY, { toggles: nextToggles }),
    ]);

    return NextResponse.json({ success: true, message: "Partner deleted" });
  } catch (error) {
    console.error("Failed to delete partner:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete partner" },
      { status: 500 }
    );
  }
}
