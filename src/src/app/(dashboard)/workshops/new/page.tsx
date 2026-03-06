"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function getMinEventDate(format: string): string {
  const d = new Date();
  const leadDays = format === "VIRTUAL" ? 60 : 90;
  d.setDate(d.getDate() + leadDays);
  return d.toISOString().split("T")[0];
}

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
}

export function NewWorkshopForm({ isCoachPortal = false }: NewWorkshopFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [workshopTypes, setWorkshopTypes] = useState<WorkshopType[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionResponse["user"]>(undefined);
  const [termsAccepted, setTermsAccepted] = useState(false);
  // MR-17: typeahead state for coach combobox (admin view)
  const [coachQuery, setCoachQuery] = useState("");
  const [showCoachDropdown, setShowCoachDropdown] = useState(false);

  const [formData, setFormData] = useState({
    coachId: "",
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
    geoTargetAreas: "",
    excludedClients: "",
    maxAttendees: "50",
    couponDiscountPercent: "",
    couponCode: "",
    customPricingRequest: "",
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [coachesRes, typesRes, sessionRes, categoriesRes] = await Promise.all([
          fetch("/api/coaches"),
          fetch("/api/workshop-types"),
          fetch("/api/auth/session"),
          fetch("/api/categories"),
        ]);

        const coachesData = await coachesRes.json();
        const typesData = await typesRes.json();
        const sessionData = (await sessionRes.json()) as SessionResponse;
        const categoriesData = await categoriesRes.json();

        const coachesList: Coach[] = coachesData.success ? coachesData.data : [];
        const workshopTypeList: WorkshopType[] = typesData.success ? typesData.data : [];
        const categoriesList: CategoryData[] = Array.isArray(categoriesData) ? categoriesData : [];

        setCoaches(coachesList);
        setWorkshopTypes(workshopTypeList);
        setCategories(categoriesList);
        setSessionUser(sessionData.user);

        // Auto-select first category
        if (categoriesList.length > 0) {
          setFormData((prev) => ({
            ...prev,
            categoryId: prev.categoryId || categoriesList[0].id,
          }));
        }

        if (sessionData.user?.role === "COACH" && sessionData.user.email) {
          const matchingCoach = coachesList.find(
            (coach) => coach.email.toLowerCase() === sessionData.user?.email?.toLowerCase()
          );

          if (matchingCoach) {
            setSelectedCoach(matchingCoach);
            setCoachQuery(`${matchingCoach.firstName} ${matchingCoach.lastName}`);
            setFormData((prev) => ({
              ...prev,
              coachId: matchingCoach.id,
            }));
          }
        }
      } catch (loadError) {
        console.error("Failed to load data:", loadError);
      }
    }

    void loadData();
  }, []);

  const availableWorkshopTypes = useMemo(() => {
    if (!selectedCoach) {
      return workshopTypes;
    }

    return workshopTypes.filter((type) =>
      selectedCoach.certifications.some(
        (cert) => cert.workshopTypeId === type.id && cert.status === "ACTIVE"
      )
    );
  }, [selectedCoach, workshopTypes]);

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
        // Auto-generate title and description from category defaults
        if (typeof nextValue === "string" && nextValue) {
          const cat = categories.find((c) => c.id === nextValue);
          if (cat) {
            const coach = coaches.find((c) => c.id === next.coachId);
            const coachName = coach ? `${coach.firstName} ${coach.lastName}` : "";
            const baseTitle = cat.defaultTitle || `Scaling Up ${cat.name}`;
            next.title = coachName ? `${baseTitle} with ${coachName}` : baseTitle;
            if (cat.defaultDescription) {
              next.description = cat.defaultDescription;
            }
          }
        }
      }

      // Re-generate title when coach changes (if category is already selected)
      if (name === "coachId" && typeof nextValue === "string" && next.categoryId) {
        const cat = categories.find((c) => c.id === next.categoryId);
        if (cat) {
          const coach = coaches.find((c) => c.id === nextValue);
          const coachName = coach ? `${coach.firstName} ${coach.lastName}` : "";
          const baseTitle = cat.defaultTitle || `Scaling Up ${cat.name}`;
          next.title = coachName ? `${baseTitle} with ${coachName}` : baseTitle;
        }
      }

      if (name === "isFree" && nextValue === true) {
        next.couponDiscountPercent = "";
        next.couponCode = "";
        next.priceCents = "";
      }

      if (name === "couponDiscountPercent") {
        const discount = String(nextValue);
        if (!discount) {
          next.couponCode = "";
        } else if (!prev.couponCode) {
          next.couponCode = generateCouponCode(discount, prev.title);
        }
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
        couponDiscountPercent: formData.couponDiscountPercent
          ? Number.parseInt(formData.couponDiscountPercent, 10)
          : undefined,
        couponCode: formData.couponCode || undefined,
        customPricingRequest: formData.customPricingRequest || undefined,
      };

      if (isCoachPortal) {
        // MR-16: Coach portal — submit as approval request
        const approvalPayload = {
          type: "WORKSHOP_REQUEST",
          workshopTypeId: formData.workshopTypeId,
          details: {
            ...payload,
            termsAcceptedAt: new Date().toISOString(),
          },
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

      if (formData.isDuoWorkshop && formData.secondaryCoachId) {
        const params = new URLSearchParams();
        params.set("coach2Id", formData.secondaryCoachId);

        if (formData.couponCode) {
          params.set("couponCode", formData.couponCode);
        }
        if (formData.couponDiscountPercent) {
          params.set("couponDiscountPercent", formData.couponDiscountPercent);
        }

        router.push(`/workshops/${data.data.id}/landing-pages/duo-landing?${params.toString()}`);
        return;
      }

      router.push(`/workshops/${data.data.id}/landing-pages`);
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
                    <div className="absolute z-20 w-full bg-background border border-border rounded-md shadow-lg max-h-48 overflow-auto mt-1">
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
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                readOnly={coachIsAutoFilled && Boolean(formData.description)}
                rows={4}
                className={`mt-1 block w-full rounded-md border border-border px-3 py-2 focus:border-primary focus:ring-primary ${coachIsAutoFilled && formData.description ? "bg-muted" : ""}`}
                placeholder="Internal notes for operations and setup..."
              />
              <p className="text-sm text-muted-foreground mt-1">
                {coachIsAutoFilled && formData.description
                  ? "Description auto-populated from category."
                  : "Internal only. Not shown in landing page editors."}
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
                  min={getMinEventDate(formData.format)}
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
                  value={formData.eventEndTime}
                  onChange={handleChange}
                  className="mt-1"
                />
              </div>
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
                <Label htmlFor="virtualLink">Meeting Link</Label>
                <Input
                  id="virtualLink"
                  name="virtualLink"
                  type="url"
                  value={formData.virtualLink}
                  onChange={handleChange}
                  placeholder="https://..."
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
                  <Label htmlFor="priceCents">Workshop Price ($) *</Label>
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
                    Suggested: $395 (half-day), $595 (full-day)
                  </p>
                </div>

                <div>
                  <Label htmlFor="customPricingRequest">Custom Pricing Request</Label>
                  <textarea
                    id="customPricingRequest"
                    name="customPricingRequest"
                    value={formData.customPricingRequest}
                    onChange={handleChange}
                    rows={2}
                    className="mt-1 block w-full rounded-md border border-border px-3 py-2 focus:border-primary focus:ring-primary"
                    placeholder="If you need the price of your workshop to be different, please share your pricing here."
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Optional. Share any special pricing needs for this workshop.
                  </p>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div>
                    <Label htmlFor="couponDiscountPercent">Coach Coupon Discount</Label>
                    <select
                      id="couponDiscountPercent"
                      name="couponDiscountPercent"
                      value={formData.couponDiscountPercent}
                      onChange={handleChange}
                      className="mt-1 block w-full rounded-md border border-border px-3 py-2 focus:border-primary focus:ring-primary"
                    >
                      <option value="">No coupon</option>
                      {COUPON_PRESETS.map((preset) => (
                        <option key={preset.value} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {formData.couponDiscountPercent && (
                    <div>
                      <Label htmlFor="couponCode">Coupon Code</Label>
                      <Input
                        id="couponCode"
                        name="couponCode"
                        value={formData.couponCode}
                        onChange={handleChange}
                        placeholder="e.g., SU50-DETROIT"
                        className="mt-1"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Share this code with registrants. Checkout already supports discount codes.
                      </p>
                    </div>
                  )}
                </div>
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
