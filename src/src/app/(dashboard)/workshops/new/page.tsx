"use client";

import { useState, useEffect } from "react";
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
  durationOptions: string[];
}

export default function NewWorkshopPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [workshopTypes, setWorkshopTypes] = useState<WorkshopType[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);

  const [formData, setFormData] = useState({
    coachId: "",
    workshopTypeId: "",
    workshopCategory: "AI" as "AI" | "EXIT_AND_VALUATION",
    title: "",
    description: "",
    format: "IN_PERSON",
    duration: "",
    eventDate: "",
    eventTime: "",
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
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [coachesRes, typesRes] = await Promise.all([
          fetch("/api/coaches"),
          fetch("/api/workshop-types"),
        ]);
        const coachesData = await coachesRes.json();
        const typesData = await typesRes.json();

        if (coachesData.success) setCoaches(coachesData.data);
        if (typesData.success) setWorkshopTypes(typesData.data);
      } catch (err) {
        console.error("Failed to load data:", err);
      }
    }
    loadData();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const newValue = type === "checkbox" ? (e.target as HTMLInputElement).checked : value;

    setFormData((prev) => ({ ...prev, [name]: newValue }));

    if (name === "coachId") {
      const coach = coaches.find((c) => c.id === value);
      setSelectedCoach(coach || null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        coachId: formData.coachId,
        workshopTypeId: formData.workshopTypeId,
        category: formData.workshopCategory,
        title: formData.title,
        description: formData.description || undefined,
        format: formData.format,
        duration: formData.duration,
        eventDate: formData.eventDate,
        eventTime: formData.eventTime || undefined,
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
        priceCents: formData.isFree ? undefined : parseInt(formData.priceCents) * 100,
        earlyBirdPriceCents: formData.earlyBirdPriceCents
          ? parseInt(formData.earlyBirdPriceCents) * 100
          : undefined,
        earlyBirdDeadline: formData.earlyBirdDeadline || undefined,
        maxAttendees: parseInt(formData.maxAttendees),
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

      router.push(`/workshops/${data.data.id}/landing-pages`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const selectedWorkshopType = workshopTypes.find(
    (t) => t.id === formData.workshopTypeId
  );

  // Filter workshop types based on coach certifications
  const availableWorkshopTypes = selectedCoach
    ? workshopTypes.filter((type) =>
        selectedCoach.certifications.some(
          (cert) => cert.workshopTypeId === type.id && cert.status === "ACTIVE"
        )
      )
    : workshopTypes;

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

        {/* Coach & Type Selection */}
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
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">Select a coach...</option>
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.firstName} {coach.lastName} ({coach.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="workshopTypeId">Workshop Type *</Label>
              <select
                id="workshopTypeId"
                name="workshopTypeId"
                value={formData.workshopTypeId}
                onChange={handleChange}
                required
                disabled={!formData.coachId}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
              >
                <option value="">Select workshop type...</option>
                {availableWorkshopTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
              {formData.coachId && availableWorkshopTypes.length === 0 && (
                <p className="text-sm text-red-600 mt-1">
                  This coach has no active certifications
                </p>
              )}
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
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                placeholder="Describe what attendees will learn..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Schedule & Format */}
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
                <Label htmlFor="duration">Duration *</Label>
                <select
                  id="duration"
                  name="duration"
                  value={formData.duration}
                  onChange={handleChange}
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Select duration...</option>
                  {(selectedWorkshopType?.durationOptions || [
                    "full-day",
                    "half-day",
                    "virtual-2hr",
                  ]).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
            </div>

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
          </CardContent>
        </Card>

        {/* Location */}
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

        {/* Virtual Details */}
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
                  <option value="webex">Webex</option>
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

        {/* Pricing */}
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
              </>
            )}
          </CardContent>
        </Card>

        {/* Submit */}
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
