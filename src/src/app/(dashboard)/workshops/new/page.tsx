"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  category: "AI" | "EXIT_AND_VALUATION"
): boolean {
  const token = normalizeToken(`${type.slug} ${type.name}`);

  if (category === "AI") {
    return token.includes(" ai ") || token.startsWith("ai ") || token.endsWith(" ai") || token.includes("artificial intelligence");
  }

  return token.includes("exit") || token.includes("valuation");
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

export default function NewWorkshopPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [workshopTypes, setWorkshopTypes] = useState<WorkshopType[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionResponse["user"]>(undefined);

  const [formData, setFormData] = useState({
    coachId: "",
    secondaryCoachId: "",
    isDuoWorkshop: false,
    workshopTypeId: "",
    workshopCategory: "AI" as "AI" | "EXIT_AND_VALUATION",
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
    parkingInstructions: "",
    virtualPlatform: "",
    virtualLink: "",
    isFree: false,
    priceCents: "",
    earlyBirdPriceCents: "",
    earlyBirdDeadline: "",
    maxAttendees: "50",
    couponDiscountPercent: "",
    couponCode: "",
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [coachesRes, typesRes, sessionRes] = await Promise.all([
          fetch("/api/coaches"),
          fetch("/api/workshop-types"),
          fetch("/api/auth/session"),
        ]);

        const coachesData = await coachesRes.json();
        const typesData = await typesRes.json();
        const sessionData = (await sessionRes.json()) as SessionResponse;

        const coachesList: Coach[] = coachesData.success ? coachesData.data : [];
        const workshopTypeList: WorkshopType[] = typesData.success ? typesData.data : [];

        setCoaches(coachesList);
        setWorkshopTypes(workshopTypeList);
        setSessionUser(sessionData.user);

        if (sessionData.user?.role === "COACH" && sessionData.user.email) {
          const matchingCoach = coachesList.find(
            (coach) => coach.email.toLowerCase() === sessionData.user?.email?.toLowerCase()
          );

          if (matchingCoach) {
            setSelectedCoach(matchingCoach);
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

  const recommendedWorkshopType = useMemo(() => {
    const categoryMatchedTypes = availableWorkshopTypes.filter((type) =>
      workshopTypeMatchesCategory(type, formData.workshopCategory)
    );

    return categoryMatchedTypes[0] || availableWorkshopTypes[0] || null;
  }, [availableWorkshopTypes, formData.workshopCategory]);

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

      if (name === "isFree" && nextValue === true) {
        next.couponDiscountPercent = "";
        next.couponCode = "";
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
      if (!formData.workshopTypeId) {
        throw new Error("No certified workshop type is available for the selected coach and category.");
      }

      if (formData.isDuoWorkshop && !formData.secondaryCoachId) {
        throw new Error("Please select Coach 2 for a duo workshop.");
      }

      if (formData.eventEndTime && !formData.eventTime) {
        throw new Error("Please provide a start time before setting an end time.");
      }

      const parsedPrice = Number.parseInt(formData.priceCents || "0", 10);
      const parsedEarlyBirdPrice = Number.parseInt(formData.earlyBirdPriceCents || "0", 10);
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
        category: formData.workshopCategory,
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
        parkingInstructions: formData.parkingInstructions || undefined,
        virtualPlatform: formData.virtualPlatform || undefined,
        virtualLink: formData.virtualLink || undefined,
        isFree: formData.isFree,
        priceCents: formData.isFree ? undefined : Math.max(0, parsedPrice) * 100,
        earlyBirdPriceCents:
          !formData.isFree && formData.earlyBirdPriceCents
            ? Math.max(0, parsedEarlyBirdPrice) * 100
            : undefined,
        earlyBirdDeadline: formData.earlyBirdDeadline || undefined,
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
      };

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
        <h1 className="text-2xl font-bold text-gray-900">Create New Workshop</h1>
        <p className="text-gray-600">Set up a new workshop event</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Workshop Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="coachId">Coach *</Label>
              <select
                id="coachId"
                name="coachId"
                value={formData.coachId}
                onChange={handleChange}
                required
                disabled={coachIsAutoFilled}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
              >
                <option value="">Select a coach...</option>
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.firstName} {coach.lastName} ({coach.email})
                  </option>
                ))}
              </select>
              {coachIsAutoFilled && (
                <p className="text-sm text-gray-500 mt-1">
                  Coach is auto-filled from login.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                id="isDuoWorkshop"
                name="isDuoWorkshop"
                type="checkbox"
                checked={formData.isDuoWorkshop}
                onChange={handleChange}
                className="rounded border-gray-300"
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
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
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

            <div>
              <Label>Workshop Type *</Label>
              <div className="mt-1 rounded-md border border-gray-300 px-3 py-2 bg-gray-50 text-gray-900">
                {recommendedWorkshopType?.name || "No active workshop type available"}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Workshop type is assigned automatically from coach certification + category.
              </p>
              <input type="hidden" name="workshopTypeId" value={formData.workshopTypeId} />
            </div>

            <div>
              <Label htmlFor="workshopCategory">Workshop Category *</Label>
              <select
                id="workshopCategory"
                name="workshopCategory"
                value={formData.workshopCategory}
                onChange={handleChange}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="AI">AI Workshop</option>
                <option value="EXIT_AND_VALUATION">Exit and Valuation Workshop</option>
              </select>
              <p className="text-sm text-gray-500 mt-1">
                {formData.workshopCategory === "AI"
                  ? "AI workshops help business owners understand and leverage AI strategically"
                  : "Exit & Valuation workshops help owners maximize business value and plan their exit"}
              </p>
            </div>

            <div>
              <Label htmlFor="title">Workshop Title *</Label>
              <Input
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                placeholder="e.g., AI Workshop - Chicago March 2025"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="description">Internal Description</Label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                placeholder="Internal notes for operations and setup..."
              />
              <p className="text-sm text-gray-500 mt-1">
                Internal only. Not shown in landing page editors.
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
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="IN_PERSON">In-Person</option>
                  <option value="VIRTUAL">Virtual</option>
                  <option value="HYBRID">Hybrid</option>
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
                <Label htmlFor="parkingInstructions">Parking Instructions</Label>
                <textarea
                  id="parkingInstructions"
                  name="parkingInstructions"
                  value={formData.parkingInstructions}
                  onChange={handleChange}
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Parking details for attendees..."
                />
              </div>
            </CardContent>
          </Card>
        )}

        {(formData.format === "VIRTUAL" || formData.format === "HYBRID") && (
          <Card>
            <CardHeader>
              <CardTitle>Virtual Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="virtualPlatform">Platform</Label>
                <select
                  id="virtualPlatform"
                  name="virtualPlatform"
                  value={formData.virtualPlatform}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Select platform...</option>
                  <option value="zoom">Zoom</option>
                  <option value="teams">Microsoft Teams</option>
                  <option value="meet">Google Meet</option>
                </select>
              </div>

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
            <div className="flex items-center gap-2">
              <input
                id="isFree"
                name="isFree"
                type="checkbox"
                checked={formData.isFree}
                onChange={handleChange}
                className="rounded border-gray-300"
              />
              <Label htmlFor="isFree">This is a free workshop</Label>
            </div>

            {!formData.isFree && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="priceCents">Price ($) *</Label>
                    <Input
                      id="priceCents"
                      name="priceCents"
                      type="number"
                      min="0"
                      step="1"
                      value={formData.priceCents}
                      onChange={handleChange}
                      required={!formData.isFree}
                      placeholder="299"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="earlyBirdPriceCents">Early Bird Price ($)</Label>
                    <Input
                      id="earlyBirdPriceCents"
                      name="earlyBirdPriceCents"
                      type="number"
                      min="0"
                      step="1"
                      value={formData.earlyBirdPriceCents}
                      onChange={handleChange}
                      placeholder="249"
                      className="mt-1"
                    />
                  </div>
                </div>

                {formData.earlyBirdPriceCents && (
                  <div>
                    <Label htmlFor="earlyBirdDeadline">Early Bird Deadline</Label>
                    <Input
                      id="earlyBirdDeadline"
                      name="earlyBirdDeadline"
                      type="date"
                      value={formData.earlyBirdDeadline}
                      onChange={handleChange}
                      className="mt-1"
                    />
                  </div>
                )}

                <div className="rounded-lg border border-gray-200 p-4 space-y-4">
                  <div>
                    <Label htmlFor="couponDiscountPercent">Coach Coupon Discount</Label>
                    <select
                      id="couponDiscountPercent"
                      name="couponDiscountPercent"
                      value={formData.couponDiscountPercent}
                      onChange={handleChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
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
                      <p className="text-sm text-gray-500 mt-1">
                        Share this code with registrants. Checkout already supports discount codes.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
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
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? "Creating..." : "Continue to Landing Pages"}
          </Button>
        </div>
      </form>
    </div>
  );
}

