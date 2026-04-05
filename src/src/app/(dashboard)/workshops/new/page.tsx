"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorkshopRulesPanel } from "@/components/workshops/workshop-rules-panel";

interface Coach {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  certifications: {
    workshopTypeId: string;
    status: string;
  }[];
}

interface WorkshopType {
  id: string;
  name: string;
  slug: string;
}

interface CategoryData {
  id: string;
  name: string;
  slug: string;
  defaultTitle: string | null;
  defaultDescription: string | null;
  pricingTiers: PricingTierData[];
}

interface PricingTierData {
  id: string;
  name: string;
  amountCents: number;
  description: string | null;
}

interface SessionResponse {
  user?: {
    email?: string;
    role?: string;
  };
}

const COUPON_PRESETS = [
  { value: "25", label: "25% discount" },
  { value: "50", label: "50% discount" },
  { value: "100", label: "100% discount (free access)" },
];

function normalizeToken(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function workshopTypeMatchesCategory(
  type: WorkshopType,
  categorySlug: string
): boolean {
  const token = normalizeToken(`${type.slug} ${type.name}`);
  const catToken = normalizeToken(categorySlug);

  if (catToken.includes("ai") || catToken.includes("artificial")) {
    return token.includes(" ai ") || token.startsWith("ai ") || token.endsWith(" ai") || token.includes("artificial intelligence");
  }

  if (catToken.includes("exit") || catToken.includes("valuation")) {
    return token.includes("exit") || token.includes("valuation");
  }

  return catToken.length > 0 && token.includes(catToken);
}

function generateCouponCode(discountPercent: string, title: string): string {
  const prefix = `SU${discountPercent}`;
  const titleToken = title
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 6);

  const randomToken = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${titleToken || "WORK"}-${randomToken}`;
}

interface NewWorkshopFormProps {
  isCoachPortal?: boolean;
  prefilledCoach?: Coach;
}

// MR-21: Multi-coupon entry
interface CouponEntry {
  code: string;
  discountPercent: string;
  singleUse: boolean;
}

export function NewWorkshopForm({ isCoachPortal = false, prefilledCoach }: NewWorkshopFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [workshopTypes, setWorkshopTypes] = useState<WorkshopType[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(prefilledCoach ?? null);
  const [sessionUser, setSessionUser] = useState<SessionResponse["user"]>(undefined);
  const [termsAccepted, setTermsAccepted] = useState(false);
  // MR-17: typeahead state for coach combobox (admin view)
  const [coachQuery, setCoachQuery] = useState(
    prefilledCoach ? `${prefilledCoach.firstName} ${prefilledCoach.lastName}` : ""
  );
  const [showCoachDropdown, setShowCoachDropdown] = useState(false);
  // MR-21: Multi-coupon list (admin-only)
  const [coupons, setCoupons] = useState<CouponEntry[]>([]);
  // Custom pricing toggle: coach portal hides these fields until explicitly requested
  const [showCustomPricing, setShowCustomPricing] = useState(false);
  // Track whether coach manually edited description (prevents category change from clobbering)
  const descriptionManuallyEdited = useRef(false);

  const [formData, setFormData] = useState({
    coachId: prefilledCoach?.id ?? "",
    secondaryCoachId: "",
    isDuoWorkshop: false,
    workshopTypeId: "",
    categoryId: "",
    title: "",
    description: "",
    format: "IN_PERSON",
    eventDate: "",
    eventTime: "",
    eventEndTime: "",
    timezone: "America/New_York",
    venueName: "",
    venueStreet: "",
    venueCity: "",
    venueState: "",
    venueZip: "",
    venueInstructions: "",
    virtualLink: "",
    isFree: false,
    priceCents: "",
    pricingTierId: "",
    geoTargetAreas: "",
    excludedClients: "",
    maxAttendees: "50",
    customPricingRequest: "",
    customPrice: "",
  });

  useEffect(() => {
    async function loadData() {
      try {
        // Coach portal: prefilledCoach is passed from server — skip the coaches list fetch entirely
        const fetchPromises: Promise<Response>[] = [
          fetch("/api/workshop-types"),
          fetch("/api/categories"),
        ];
        if (!prefilledCoach) {
          fetchPromises.unshift(fetch("/api/coaches"), fetch("/api/auth/session"));
        }

        const results = await Promise.all(fetchPromises);

        let coachesList: Coach[] = [];
        let sessionData: SessionResponse = {};

        if (!prefilledCoach) {
          const [coachesRes, sessionRes, typesRes, categoriesRes] = results as [Response, Response, Response, Response];
          const coachesData = await coachesRes.json();
          sessionData = (await sessionRes.json()) as SessionResponse;
          const typesData = await typesRes.json();
          const categoriesData = await categoriesRes.json();
          coachesList = coachesData.success ? coachesData.data : [];
          setCoaches(coachesList);
          setSessionUser(sessionData.user);
          setWorkshopTypes(typesData.success ? typesData.data : []);
          const categoriesList: CategoryData[] = Array.isArray(categoriesData) ? categoriesData : [];
          setCategories(categoriesList);
          if (categoriesList.length > 0) {
            setFormData((prev) => ({ ...prev, categoryId: prev.categoryId || categoriesList[0].id }));
          }
          // Legacy email-based auto-populate for sessions without prefilledCoach
          if (sessionData.user?.role === "COACH" && sessionData.user.email) {
            const matchingCoach = coachesList.find(
              (coach) => coach.email.toLowerCase() === sessionData.user?.email?.toLowerCase()
            );
            if (matchingCoach) {
              setSelectedCoach(matchingCoach);
              setCoachQuery(`${matchingCoach.firstName} ${matchingCoach.lastName}`);
              setFormData((prev) => ({ ...prev, coachId: matchingCoach.id }));
            }
          }
        } else {
          // Coach portal with prefilledCoach: only fetch types and categories
          const [typesRes, categoriesRes] = results as [Response, Response];
          const typesData = await typesRes.json();
          const categoriesData = await categoriesRes.json();
          setWorkshopTypes(typesData.success ? typesData.data : []);
          const categoriesList: CategoryData[] = Array.isArray(categoriesData) ? categoriesData : [];
          setCategories(categoriesList);
          if (categoriesList.length > 0) {
            setFormData((prev) => ({ ...prev, categoryId: prev.categoryId || categoriesList[0].id }));
          }
          // Simulate session role for coachIsAutoFilled flag
          setSessionUser({ role: "COACH", email: prefilledCoach.email });
        }
      } catch (loadError) {
        console.error("Failed to load data:", loadError);
      }
    }

    void loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // All workshop types are available regardless of certification.
  // Uncertified requests route to manual admin approval via approval-engine.ts.
  const availableWorkshopTypes = useMemo(() => {
    return workshopTypes;
  }, [workshopTypes]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === formData.categoryId) || null,
    [categories, formData.categoryId]
  );

  const recommendedWorkshopType = useMemo(() => {
    const slug = selectedCategory?.slug || "";
    const categoryMatchedTypes = availableWorkshopTypes.filter((type) =>
      workshopTypeMatchesCategory(type, slug)
    );

    return categoryMatchedTypes[0] || availableWorkshopTypes[0] || null;
  }, [availableWorkshopTypes, selectedCategory]);

  const recommendedWorkshopTypeId = recommendedWorkshopType?.id || "";

  useEffect(() => {
    setFormData((prev) => {
      if (prev.workshopTypeId === recommendedWorkshopTypeId) {
        return prev;
      }

      return {
        ...prev,
        workshopTypeId: recommendedWorkshopTypeId,
      };
    });
  }, [recommendedWorkshopTypeId]);

  // FIG-001: Auto-generate title whenever categoryId or coachId changes (including on mount).
  // This handles the case where the useEffect init sets categoryId without going through handleChange.
  useEffect(() => {
    if (!formData.categoryId) return;
    const cat = categories.find((c) => c.id === formData.categoryId);
    if (!cat) return;

    const baseTitle = cat.defaultTitle || `Scaling Up ${cat.name}`;

    // Resolve coach name: prefer prefilledCoach, then coaches list
    let coachName = "";
    if (prefilledCoach) {
      coachName = `${prefilledCoach.firstName} ${prefilledCoach.lastName}`;
    } else if (formData.coachId) {
      const coach = coaches.find((c) => c.id === formData.coachId);
      coachName = coach ? `${coach.firstName} ${coach.lastName}` : "";
    }

    const generatedTitle = coachName ? `${baseTitle} with ${coachName}` : baseTitle;

    setFormData((prev) => {
      // Don't overwrite a title the user has manually typed.
      // A title is considered auto-generated if it's blank OR matches ANY category's auto-generated pattern.
      // We check all categories (not just the current one) so that switching categories works correctly —
      // e.g. "Scaling Up AI with JC DS" is still recognized as auto-generated when switching to E&V.
      const prevIsAutoGenerated =
        !prev.title ||
        categories.some((c) => {
          const catBase = c.defaultTitle || `Scaling Up ${c.name}`;
          return prev.title === catBase || prev.title.startsWith(`${catBase} with `);
        });

      if (!prevIsAutoGenerated) return prev;
      if (prev.title === generatedTitle) return prev;

      return { ...prev, title: generatedTitle };
    });
  }, [formData.categoryId, formData.coachId, categories, coaches]);

  const secondaryCoachOptions = coaches.filter(
    (coach) => coach.id !== formData.coachId
  );

  const coachIsAutoFilled = sessionUser?.role === "COACH" && Boolean(formData.coachId);

  // MR-17: filtered options for typeahead combobox
  const filteredCoachOptions = coaches.filter((c) => {
    if (!coachQuery) return true;
    const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
    return fullName.includes(coachQuery.toLowerCase()) || c.email.toLowerCase().includes(coachQuery.toLowerCase());
  });

  function handleCoachSelect(coach: Coach) {
    setCoachQuery(`${coach.firstName} ${coach.lastName}`);
    setSelectedCoach(coach);
    setFormData((prev) => ({ ...prev, coachId: coach.id }));
    setShowCoachDropdown(false);
  }

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = event.target;
    const nextValue =
      type === "checkbox" ? (event.target as HTMLInputElement).checked : value;

    if (name === "description") {
      descriptionManuallyEdited.current = true;
    }

    setFormData((prev) => {
      const next = { ...prev, [name]: nextValue };

      if (name === "coachId") {
        if (typeof nextValue === "string" && next.secondaryCoachId === nextValue) {
          next.secondaryCoachId = "";
        }
      }

      if (name === "isDuoWorkshop" && nextValue === false) {
        next.secondaryCoachId = "";
      }

      if (name === "format" && nextValue === "VIRTUAL") {
        next.maxAttendees = "50";
      }

      if (name === "categoryId") {
        next.priceCents = "";
        // Auto-populate description from category defaults when category changes
        // but only if coach hasn't manually edited it
        if (!descriptionManuallyEdited.current && typeof nextValue === "string" && nextValue) {
          const cat = categories.find((c) => c.id === nextValue);
          if (cat?.defaultDescription) {
            next.description = cat.defaultDescription;
          }
        }
        // Title is handled reactively by the FIG-001 useEffect below
      }

      // Title re-generation on coachId change is handled reactively by the FIG-001 useEffect

      if (name === "isFree" && nextValue === true) {
        next.priceCents = "";
        setShowCustomPricing(false);
      }

      return next;
    });

    if (name === "coachId" && typeof nextValue === "string") {
      const coach = coaches.find((item) => item.id === nextValue);
      setSelectedCoach(coach || null);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!termsAccepted) {
        throw new Error("You must accept the terms and conditions before creating a workshop.");
      }

      if (!formData.workshopTypeId) {
        throw new Error("No certified workshop type is available for the selected coach and category.");
      }

      if (formData.isDuoWorkshop && !formData.secondaryCoachId) {
        throw new Error("Please select Coach 2 for a duo workshop.");
      }

      if (formData.eventEndTime && !formData.eventTime) {
        throw new Error("Please provide a start time before setting an end time.");
      }

      if (!formData.isFree && !formData.priceCents) {
        throw new Error("Please enter a workshop price before creating a paid workshop.");
      }

      if (formData.format === "VIRTUAL" && !formData.virtualLink) {
        throw new Error("Meeting link is required for virtual workshops");
      }

      const parsedPrice = Number.parseInt(formData.priceCents || "0", 10);
      const parsedMaxAttendees = Number.parseInt(formData.maxAttendees || "50", 10);

      const startTime = formData.eventTime.trim();
      const endTime = formData.eventEndTime.trim();
      const eventTime = startTime
        ? endTime
          ? `${startTime} - ${endTime}`
          : startTime
        : undefined;

      const payload = {
        coachId: formData.coachId,
        workshopTypeId: formData.workshopTypeId,
        categoryId: formData.categoryId || undefined,
        pricingTierId: formData.pricingTierId || undefined,
        title: formData.title,
        description: formData.description || undefined,
        format: formData.format,
        duration: formData.format === "VIRTUAL" ? "virtual-session" : "full-day",
        eventDate: formData.eventDate,
        eventTime,
        eventEndTime: endTime || undefined,
        timezone: formData.timezone,
        venueName: formData.venueName || undefined,
        venueAddress:
          formData.format !== "VIRTUAL"
            ? {
                street: formData.venueStreet || undefined,
                city: formData.venueCity || undefined,
                state: formData.venueState || undefined,
                zip: formData.venueZip || undefined,
              }
            : undefined,
        venueInstructions: formData.venueInstructions || undefined,
        virtualLink: formData.virtualLink || undefined,
        geoTargetAreas: formData.geoTargetAreas || undefined,
        excludedClients: formData.excludedClients || undefined,
        isFree: formData.isFree,
        priceCents: formData.isFree ? undefined : Math.max(0, parsedPrice) * 100,
        maxAttendees:
          formData.format === "VIRTUAL"
            ? undefined
            : Number.isFinite(parsedMaxAttendees) && parsedMaxAttendees > 0
              ? parsedMaxAttendees
              : 50,
        isDuoWorkshop: formData.isDuoWorkshop,
        secondaryCoachId:
          formData.isDuoWorkshop && formData.secondaryCoachId
            ? formData.secondaryCoachId
            : undefined,
        customPricingRequest: formData.customPricingRequest || undefined,
        // MR-21: multi-coupon list (admin-only; empty for coach portal)
        coupons: coupons.length > 0 ? JSON.stringify(coupons) : undefined,
      };

      if (isCoachPortal) {
        // MR-16: Coach portal — submit as approval request
        // Spread payload fields at top level so /api/approvals can read body.* directly.
        // venueAddress must be sent as separate street/city/state/zip fields (API contract).
        const parsedCustomPrice = formData.customPrice ? Number(formData.customPrice) : null;
        const hasCustomPrice = parsedCustomPrice !== null && parsedCustomPrice > 0;
        const approvalPayload = {
          type: hasCustomPrice ? "CUSTOM_PRICING" : "WORKSHOP_REQUEST",
          ...payload,
          venueAddress: formData.venueStreet || undefined,
          venueCity: formData.venueCity || undefined,
          venueState: formData.venueState || undefined,
          venueZip: formData.venueZip || undefined,
          termsAcceptedAt: new Date().toISOString(),
          customPricingNotes: formData.customPricingRequest || undefined,
          ...(hasCustomPrice ? { amount: Math.round(parsedCustomPrice * 100) } : {}),
          ...(hasCustomPrice ? { customPrice: parsedCustomPrice } : {}),
        };
        const response = await fetch("/api/approvals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(approvalPayload),
        });
        const data = await response.json();
        if (!data.success) {
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : data.error?.[0]?.message || "Failed to submit workshop request"
          );
        }
        router.push("/portal/home?submitted=1");
        return;
      }

      const response = await fetch("/api/workshops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : data.error?.[0]?.message || "Failed to create workshop"
        );
      }

      // Redirect to workshop detail — auto-build fires server-side via Inngest
      router.push(`/workshops/${data.data.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          {isCoachPortal ? "Request New Workshop" : "Create New Workshop"}
        </h1>
        <p className="text-muted-foreground">
          {isCoachPortal
            ? "Complete the form below to submit a workshop request for approval."
            : "Set up a new workshop event"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* MR-12-form: Workshop rules instructions panel */}
        <WorkshopRulesPanel />

        <Card>
          <CardHeader>
            <CardTitle>Workshop Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="coachId">Coach *</Label>
              {coachIsAutoFilled ? (
                <>
                  <Input
                    id="coachId"
                    value={coachQuery}
                    disabled
                    className="mt-1 bg-muted"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Coach is auto-filled from login.
                  </p>
                </>
              ) : (
                /* MR-17: Typeahead combobox for admin */
                <div className="relative mt-1">
                  <Input
                    id="coachId"
                    value={coachQuery}
                    onChange={(e) => {
                      setCoachQuery(e.target.value);
                      setShowCoachDropdown(true);
                      if (!e.target.value) {
                        setSelectedCoach(null);
                        setFormData((prev) => ({ ...prev, coachId: "" }));
                      }
                    }}
                    onFocus={() => setShowCoachDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCoachDropdown(false), 150)}
                    placeholder="Type to search coaches..."
                    required
                    autoComplete="off"
                  />
                  {showCoachDropdown && filteredCoachOptions.length > 0 && (
                    <div className="absolute z-50 w-full bg-background border border-border rounded-md shadow-lg max-h-48 overflow-auto mt-1">
                      {filteredCoachOptions.map((coach) => (
                        <button
                          key={coach.id}
                          type="button"
                          onMouseDown={() => handleCoachSelect(coach)}
                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                        >
                          {coach.firstName} {coach.lastName}{" "}
                          <span className="text-muted-foreground">({coach.email})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* MR-16: Duo workshop is admin-only */}
            {!isCoachPortal && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    id="isDuoWorkshop"
                    name="isDuoWorkshop"
                    type="checkbox"
                    checked={formData.isDuoWorkshop}
                    onChange={handleChange}
                    className="rounded border-border"
                  />
                  <Label htmlFor="isDuoWorkshop">Duo workshop (add Coach 2)</Label>
                </div>

                {formData.isDuoWorkshop && (
                  <div>
                    <Label htmlFor="secondaryCoachId">Coach 2 *</Label>
                    <select
                      id="secondaryCoachId"
                      name="secondaryCoachId"
                      value={formData.secondaryCoachId}
                      onChange={handleChange}
                      required={formData.isDuoWorkshop}
                      className="mt-1 block w-full rounded-md border border-border px-3 py-2 focus:border-primary focus:ring-primary"
                    >
                      <option value="">Select Coach 2...</option>
                      {secondaryCoachOptions.map((coach) => (
                        <option key={coach.id} value={coach.id}>
                          {coach.firstName} {coach.lastName} ({coach.email})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            <input type="hidden" name="workshopTypeId" value={formData.workshopTypeId} />

            <div>
              <Label htmlFor="categoryId">Workshop Category *</Label>
              <select
                id="categoryId"
                name="categoryId"
                value={formData.categoryId}
                onChange={handleChange}
                required
                className="mt-1 block w-full rounded-md border border-border px-3 py-2 focus:border-primary focus:ring-primary"
              >
                <option value="">Select a category...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              {categories.length === 0 && (
                <p className="text-sm text-warning mt-1">
                  No categories found. An admin must create categories first.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                readOnly={coachIsAutoFilled}
                placeholder="Auto-generated from category + coach"
                className={`mt-1 ${coachIsAutoFilled ? "bg-muted" : ""}`}
              />
              {coachIsAutoFilled && formData.title && (
                <p className="text-sm text-muted-foreground mt-1">
                  Title is auto-generated from your category selection.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="description">Internal Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="mt-1"
                placeholder="Internal notes for operations and setup..."
              />
              <p className="text-sm text-muted-foreground mt-1">
                {"Internal only. Not shown in landing page editors."}
              </p>
            </div>

            <div>
              <Label htmlFor="geoTargetAreas">Geographic Target Areas</Label>
              <textarea
                id="geoTargetAreas"
                name="geoTargetAreas"
                value={formData.geoTargetAreas}
                onChange={handleChange}
                rows={2}
                className="mt-1 block w-full rounded-md border border-border px-3 py-2 focus:border-primary focus:ring-primary"
                placeholder="e.g., Chicago metro, Northern Illinois, Southeast Wisconsin"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Regions this workshop targets for marketing and outreach.
              </p>
            </div>

            <div>
              <Label htmlFor="excludedClients">Excluded Contracted Clients</Label>
              <textarea
                id="excludedClients"
                name="excludedClients"
                value={formData.excludedClients}
                onChange={handleChange}
                rows={2}
                className="mt-1 block w-full rounded-md border border-border px-3 py-2 focus:border-primary focus:ring-primary"
                placeholder="e.g., Acme Corp, GlobalTech Inc"
              />
              <p className="text-sm text-muted-foreground mt-1">
                If you would like to exclude existing contracted clients, from the 10% fee, please list those current clients here.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schedule & Format</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="format">Format *</Label>
                <select
                  id="format"
                  name="format"
                  value={formData.format}
                  onChange={handleChange}
                  required
                  className="mt-1 block w-full rounded-md border border-border px-3 py-2 focus:border-primary focus:ring-primary"
                >
                  <option value="IN_PERSON">In-Person</option>
                  <option value="VIRTUAL">Virtual</option>
                </select>
              </div>

              <div>
                <Label htmlFor="eventDate">Event Date *</Label>
                <Input
                  id="eventDate"
                  name="eventDate"
                  type="date"
                  value={formData.eventDate}
                  onChange={handleChange}
                  required
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="eventTime">Start Time</Label>
                <Input
                  id="eventTime"
                  name="eventTime"
                  type="time"
                  step="900"
                  value={formData.eventTime}
                  onChange={handleChange}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="eventEndTime">End Time</Label>
                <Input
                  id="eventEndTime"
                  name="eventEndTime"
                  type="time"
                  step="900"
                  value={formData.eventEndTime}
                  onChange={handleChange}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <select
                id="timezone"
                name="timezone"
                value={formData.timezone}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary bg-background"
              >
                <option value="America/New_York">Eastern Time (ET)</option>
                <option value="America/Chicago">Central Time (CT)</option>
                <option value="America/Denver">Mountain Time (MT)</option>
                <option value="America/Los_Angeles">Pacific Time (PT)</option>
                <option value="America/Phoenix">Arizona (no DST)</option>
                <option value="Pacific/Honolulu">Hawaii (HT)</option>
              </select>
            </div>

            {formData.format !== "VIRTUAL" && (
              <div>
                <Label htmlFor="maxAttendees">Maximum Attendees</Label>
                <Input
                  id="maxAttendees"
                  name="maxAttendees"
                  type="number"
                  min="1"
                  value={formData.maxAttendees}
                  onChange={handleChange}
                  className="mt-1"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {formData.format !== "VIRTUAL" && (
          <Card>
            <CardHeader>
              <CardTitle>Location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="venueName">Venue Name</Label>
                <Input
                  id="venueName"
                  name="venueName"
                  value={formData.venueName}
                  onChange={handleChange}
                  placeholder="e.g., Marriott Conference Center"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="venueStreet">Street Address</Label>
                <Input
                  id="venueStreet"
                  name="venueStreet"
                  value={formData.venueStreet}
                  onChange={handleChange}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="venueCity">City</Label>
                  <Input
                    id="venueCity"
                    name="venueCity"
                    value={formData.venueCity}
                    onChange={handleChange}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="venueState">State</Label>
                  <Input
                    id="venueState"
                    name="venueState"
                    value={formData.venueState}
                    onChange={handleChange}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="venueZip">ZIP Code</Label>
                  <Input
                    id="venueZip"
                    name="venueZip"
                    value={formData.venueZip}
                    onChange={handleChange}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="venueInstructions">Venue Instructions</Label>
                <textarea
                  id="venueInstructions"
                  name="venueInstructions"
                  value={formData.venueInstructions}
                  onChange={handleChange}
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-border px-3 py-2 focus:border-primary focus:ring-primary"
                  placeholder="Parking, entrance, and venue details for attendees..."
                />
              </div>
            </CardContent>
          </Card>
        )}

        {formData.format === "VIRTUAL" && (
          <Card>
            <CardHeader>
              <CardTitle>Virtual Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="virtualLink">Meeting Link *</Label>
                <Input
                  id="virtualLink"
                  name="virtualLink"
                  type="url"
                  value={formData.virtualLink}
                  onChange={handleChange}
                  placeholder="https://..."
                  required
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.format !== "IN_PERSON" && (
              <div className="flex items-center gap-2">
                <input
                  id="isFree"
                  name="isFree"
                  type="checkbox"
                  checked={formData.isFree}
                  onChange={handleChange}
                  className="rounded border-border"
                />
                <Label htmlFor="isFree">This is a free workshop</Label>
              </div>
            )}

            {!formData.isFree && (
              <>
                <div>
                  <Label htmlFor="pricingTierId">Workshop Price *</Label>
                  {selectedCategory?.pricingTiers && selectedCategory.pricingTiers.length > 0 ? (
                    <Select
                      value={formData.pricingTierId}
                      onValueChange={(val) => {
                        const tier = selectedCategory.pricingTiers.find((t) => t.id === val);
                        setFormData((prev) => ({
                          ...prev,
                          pricingTierId: val,
                          priceCents: tier ? String(Math.round(tier.amountCents / 100)) : prev.priceCents,
                        }));
                      }}
                    >
                      <SelectTrigger id="pricingTierId" className="mt-1 bg-background">
                        <SelectValue placeholder="Select pricing tier" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedCategory.pricingTiers.map((tier) => (
                          <SelectItem key={tier.id} value={tier.id}>
                            {tier.name} — ${(tier.amountCents / 100).toFixed(0)}
                            {tier.description ? ` (${tier.description})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <>
                      <Input
                        id="priceCents"
                        name="priceCents"
                        type="number"
                        min="0"
                        step="1"
                        value={formData.priceCents}
                        onChange={handleChange}
                        required={!formData.isFree}
                        placeholder="395"
                        className="mt-1"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        No pricing tiers defined for this category. Enter a price manually.
                      </p>
                    </>
                  )}
                </div>

                {/* Coach portal: hide custom pricing behind a toggle. Admin: always visible. */}
                {isCoachPortal && !showCustomPricing && !formData.customPrice && !formData.customPricingRequest && (
                  <button
                    type="button"
                    aria-expanded={false}
                    aria-controls="custom-pricing-section"
                    className="text-sm text-primary underline-offset-2 hover:underline"
                    onClick={() => setShowCustomPricing(true)}
                  >
                    Request custom pricing <span aria-hidden="true">→</span>
                  </button>
                )}

                {/* Toggle is one-way by design: once opened, only closes on page refresh or isFree toggle */}
                {(!isCoachPortal || showCustomPricing || !!formData.customPrice || !!formData.customPricingRequest) && (
                  <div id="custom-pricing-section">
                    <div>
                      <Label htmlFor="customPrice">Custom Price (USD)</Label>
                      <Input
                        id="customPrice"
                        name="customPrice"
                        type="number"
                        min="0"
                        step="1"
                        value={formData.customPrice}
                        onChange={handleChange}
                        className="mt-1"
                        placeholder="e.g. 495"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Optional. If provided, overrides the pricing tier and routes to admin for approval.
                      </p>
                    </div>

                    <div className="mt-4">
                      <Label htmlFor="customPricingRequest">Custom Pricing Notes</Label>
                      <Textarea
                        id="customPricingRequest"
                        name="customPricingRequest"
                        value={formData.customPricingRequest}
                        onChange={handleChange}
                        rows={2}
                        className="mt-1"
                        placeholder="Any context for the custom price request (optional)."
                      />
                    </div>
                  </div>
                )}

                {/* MR-21: Multi-coupon / MR-22: Admin-only */}
                {!isCoachPortal && (
                  <div className="rounded-lg border border-border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Coupon Codes</Label>
                      <button
                        type="button"
                        onClick={() => setCoupons((prev) => [...prev, { code: "", discountPercent: "", singleUse: false }])}
                        className="text-xs text-primary hover:text-primary/80 font-medium"
                      >
                        + Add Coupon
                      </button>
                    </div>
                    {coupons.length === 0 && (
                      <p className="text-xs text-muted-foreground">No coupons added. Click &quot;Add Coupon&quot; to create discount codes for this workshop.</p>
                    )}
                    {coupons.map((coupon, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          value={coupon.code}
                          onChange={(e) => setCoupons((prev) => prev.map((c, i) => i === idx ? { ...c, code: e.target.value.toUpperCase() } : c))}
                          placeholder="e.g., SU50-DETROIT"
                          className="flex-1"
                        />
                        <select
                          value={coupon.discountPercent}
                          onChange={(e) => setCoupons((prev) => prev.map((c, i) => i === idx ? { ...c, discountPercent: e.target.value } : c))}
                          className="rounded-md border border-border px-2 py-2 text-sm focus:border-primary"
                        >
                          <option value="">%</option>
                          {COUPON_PRESETS.map((p) => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                          <input
                            type="checkbox"
                            checked={coupon.singleUse}
                            onChange={(e) => setCoupons((prev) => prev.map((c, i) => i === idx ? { ...c, singleUse: e.target.checked } : c))}
                            className="rounded border-border"
                          />
                          Single-use
                        </label>
                        <button
                          type="button"
                          onClick={() => setCoupons((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-destructive hover:text-destructive/80 text-sm px-1"
                          title="Remove coupon"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {coupons.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Codes will be validated at checkout and synced to Stripe automatically when the workshop is created.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <input
                id="termsAccepted"
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 rounded border-border"
              />
              <Label htmlFor="termsAccepted" className="text-sm text-foreground leading-relaxed">
                I confirm that all workshop details are accurate and I agree to the Scaling Up
                workshop{" "}
                <a
                  href="/api/files/terms-and-conditions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary hover:text-primary/80"
                >
                  terms and conditions
                </a>
                , including the cancellation and refund policies.
              </Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading || !termsAccepted} className="flex-1">
            {loading
              ? isCoachPortal ? "Submitting..." : "Creating..."
              : isCoachPortal ? "Submit Request" : "Continue to Workshop Editor"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewWorkshopPage() {
  return <NewWorkshopForm isCoachPortal={false} />;
}
