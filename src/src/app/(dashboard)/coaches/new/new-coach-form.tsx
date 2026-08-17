"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

interface WorkshopType {
  id: string;
  name: string;
  slug: string;
}

export function NewCoachForm({ responsiveEnabled = false }: { responsiveEnabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setWorkshopTypes] = useState<WorkshopType[]>([]);

  const [formData, setFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    title: "",
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
          title: formData.title || undefined,
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
    <div className={responsiveEnabled ? "mx-auto min-w-0 max-w-2xl" : "max-w-2xl mx-auto"}>
      {responsiveEnabled ? (
        <PageHeader
          responsiveEnabled
          title="Add New Coach"
          description="Register a new coach in the system"
        />
      ) : (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Add New Coach</h1>
          <p className="text-muted-foreground">Register a new coach in the system</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={responsiveEnabled ? "grid grid-cols-1 gap-4 md:grid-cols-2" : "grid grid-cols-2 gap-4"}>
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  placeholder="John"
                  className={responsiveEnabled ? "mt-1 min-h-11" : "mt-1"}
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
                  className={responsiveEnabled ? "mt-1 min-h-11" : "mt-1"}
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
                className={responsiveEnabled ? "mt-1 min-h-11" : "mt-1"}
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
                className={responsiveEnabled ? "mt-1 min-h-11" : "mt-1"}
              />
            </div>

            <div>
              <Label htmlFor="title">Professional Title</Label>
              <Input
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g., Master Coach"
                className={responsiveEnabled ? "mt-1 min-h-11" : "mt-1"}
              />
            </div>

            <div>
              <Label htmlFor="company">Company Name</Label>
              <Input
                id="company"
                name="company"
                value={formData.company}
                onChange={handleChange}
                placeholder="Coach's company or business name"
                className={responsiveEnabled ? "mt-1 min-h-11" : "mt-1"}
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
                className={responsiveEnabled ? "mt-1 min-h-11" : "mt-1"}
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
                className={responsiveEnabled ? "mt-1 block min-h-11 w-full min-w-0 rounded-md border border-border px-3 py-2 focus:border-primary focus:ring-primary" : "mt-1 block w-full rounded-md border border-border px-3 py-2 focus:border-primary focus:ring-primary"}
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
                className={responsiveEnabled ? "mt-1 min-h-11" : "mt-1"}
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
                className={responsiveEnabled ? "mt-1 min-h-11" : "mt-1"}
              />
            </div>
          </CardContent>
        </Card>

        <div className="bg-info/10 border border-info/20 rounded-lg p-4">
          <p className="text-sm text-info">
            <strong>Note:</strong> New coaches are created with Pending certification and payment status.
            You can update their status and add certifications after creation.
          </p>
        </div>

        <div className={responsiveEnabled ? "flex flex-col-reverse gap-4 sm:flex-row" : "flex gap-4"}>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className={responsiveEnabled ? "min-h-11 flex-1" : "flex-1"}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className={responsiveEnabled ? "min-h-11 flex-1" : "flex-1"}>
            {loading ? "Creating..." : "Create Coach"}
          </Button>
        </div>
      </form>
    </div>
  );
}
