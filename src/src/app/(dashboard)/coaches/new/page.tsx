"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WorkshopType {
  id: string;
  name: string;
  slug: string;
}

export default function NewCoachPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setWorkshopTypes] = useState<WorkshopType[]>([]);

  const [formData, setFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    company: "",
    bio: "",
    hubspotId: "",
    circleId: "",
    territory: "",
  });

  useEffect(() => {
    async function loadWorkshopTypes() {
      try {
        const response = await fetch("/api/workshop-types");
        const data = await response.json();
        if (data.success) {
          setWorkshopTypes(data.data);
        }
      } catch (err) {
        console.error("Failed to load workshop types:", err);
      }
    }
    loadWorkshopTypes();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/coaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email.toLowerCase(),
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone || undefined,
          company: formData.company || undefined,
          bio: formData.bio || undefined,
          hubspotId: formData.hubspotId || undefined,
          circleId: formData.circleId || undefined,
          territory: formData.territory || undefined,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : data.error?.[0]?.message || "Failed to create coach"
        );
      }

      router.push(`/coaches/${data.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Add New Coach</h1>
        <p className="text-muted-foreground">Register a new coach in the system</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  placeholder="John"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  placeholder="Smith"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="john.smith@example.com"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+1 (555) 123-4567"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                name="company"
                value={formData.company}
                onChange={handleChange}
                placeholder="Coach's company or business name"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="territory">Territory</Label>
              <Input
                id="territory"
                name="territory"
                value={formData.territory}
                onChange={handleChange}
                placeholder="e.g., Northeast US, California, etc."
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="bio">Bio</Label>
              <textarea
                id="bio"
                name="bio"
                value={formData.bio}
                onChange={handleChange}
                rows={4}
                className="mt-1 block w-full rounded-md border border-border px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                placeholder="Brief biography and coaching experience..."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integration IDs (Optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="hubspotId">HubSpot Contact ID</Label>
              <Input
                id="hubspotId"
                name="hubspotId"
                value={formData.hubspotId}
                onChange={handleChange}
                placeholder="HubSpot contact ID for CRM sync"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="circleId">Circle Member ID</Label>
              <Input
                id="circleId"
                name="circleId"
                value={formData.circleId}
                onChange={handleChange}
                placeholder="Circle community member ID"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> New coaches are created with Pending certification and payment status.
            You can update their status and add certifications after creation.
          </p>
        </div>

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
            {loading ? "Creating..." : "Create Coach"}
          </Button>
        </div>
      </form>
    </div>
  );
}
