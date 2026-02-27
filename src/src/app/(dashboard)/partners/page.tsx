"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

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

interface WorkshopOption {
  id: string;
  title: string;
  eventDate: string;
}

interface PartnersPayload {
  partners: PartnerProfile[];
  toggles: PartnerToggle[];
  workshops: WorkshopOption[];
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PartnersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [data, setData] = useState<PartnersPayload>({
    partners: [],
    toggles: [],
    workshops: [],
  });

  const [partnerForm, setPartnerForm] = useState({
    id: "",
    name: "",
    tagline: "",
    description: "",
    logoUrl: "",
    isActive: true,
  });

  const [toggleForm, setToggleForm] = useState({
    partnerId: "",
    workshopId: "",
    enabled: true,
  });

  const togglesWithLabels = useMemo(() => {
    return data.toggles.map((toggle) => {
      const partner = data.partners.find((item) => item.id === toggle.partnerId);
      const workshop = data.workshops.find((item) => item.id === toggle.workshopId);
      return {
        ...toggle,
        partnerName: partner?.name || "Unknown Partner",
        workshopTitle: workshop?.title || "Unknown Workshop",
      };
    });
  }, [data.partners, data.toggles, data.workshops]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/partners");
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to load partners");
      }

      const payload = result.data as PartnersPayload;
      setData(payload);

      setToggleForm((prev) => ({
        ...prev,
        partnerId: prev.partnerId || payload.partners[0]?.id || "",
        workshopId: prev.workshopId || payload.workshops[0]?.id || "",
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load partners");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function handlePartnerFormChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value, type } = event.target;
    const nextValue =
      type === "checkbox" ? (event.target as HTMLInputElement).checked : value;
    setPartnerForm((prev) => ({ ...prev, [name]: nextValue }));
    setSuccess(null);
  }

  function handleToggleFormChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = event.target;
    const nextValue =
      type === "checkbox" ? (event.target as HTMLInputElement).checked : value;
    setToggleForm((prev) => ({ ...prev, [name]: nextValue }));
    setSuccess(null);
  }

  async function handleSavePartner(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partnerForm),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to save partner");
      }

      setSuccess("Partner profile saved.");
      setPartnerForm({
        id: "",
        name: "",
        tagline: "",
        description: "",
        logoUrl: "",
        isActive: true,
      });
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save partner");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveWorkshopToggle(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/partners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "workshop-toggle",
          ...toggleForm,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to save workshop toggle");
      }

      setSuccess("Partner visibility toggle saved for workshop.");
      await loadData();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to save toggle");
    } finally {
      setSaving(false);
    }
  }

  async function handleEditPartner(partner: PartnerProfile) {
    setPartnerForm({
      id: partner.id,
      name: partner.name,
      tagline: partner.tagline,
      description: partner.description,
      logoUrl: partner.logoUrl,
      isActive: partner.isActive,
    });
    setSuccess(null);
  }

  async function handleDeletePartner(partnerId: string) {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/partners", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: partnerId }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to delete partner");
      }

      setSuccess("Partner deleted.");
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete partner");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(partnerId: string, isActive: boolean) {
    try {
      const response = await fetch("/api/partners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "partner-active",
          id: partnerId,
          isActive,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to update partner status");
      }

      await loadData();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update status");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-muted-foreground">
        Loading partners module...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Partners</h1>
        <p className="text-muted-foreground">
          Partner profiles (description/logo) with workshop-level visibility toggles.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Create / Edit Partner Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSavePartner}>
              <div>
                <Label htmlFor="name">Partner Name</Label>
                <Input
                  id="name"
                  name="name"
                  value={partnerForm.name}
                  onChange={handlePartnerFormChange}
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  name="description"
                  value={partnerForm.description}
                  onChange={handlePartnerFormChange}
                  rows={4}
                  className="mt-1 block w-full rounded-md border border-border px-3 py-2"
                />
              </div>
              <div>
                <Label htmlFor="tagline">Tagline</Label>
                <Input
                  id="tagline"
                  name="tagline"
                  value={partnerForm.tagline}
                  onChange={handlePartnerFormChange}
                  className="mt-1"
                  placeholder="Short line shown under partner logo"
                />
              </div>
              <div>
                <Label htmlFor="logoUrl">Logo URL</Label>
                <Input
                  id="logoUrl"
                  name="logoUrl"
                  value={partnerForm.logoUrl}
                  onChange={handlePartnerFormChange}
                  className="mt-1"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="isActive"
                  checked={partnerForm.isActive}
                  onChange={handlePartnerFormChange}
                  className="rounded border-border"
                />
                Partner active
              </label>
              <div>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : partnerForm.id ? "Update Partner" : "Create Partner"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Toggle Partner by Workshop</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSaveWorkshopToggle}>
              <div>
                <Label htmlFor="partnerId">Partner</Label>
                <select
                  id="partnerId"
                  name="partnerId"
                  value={toggleForm.partnerId}
                  onChange={handleToggleFormChange}
                  className="mt-1 block w-full rounded-md border border-border px-3 py-2"
                >
                  {data.partners.map((partner) => (
                    <option key={partner.id} value={partner.id}>
                      {partner.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="workshopId">Workshop</Label>
                <select
                  id="workshopId"
                  name="workshopId"
                  value={toggleForm.workshopId}
                  onChange={handleToggleFormChange}
                  className="mt-1 block w-full rounded-md border border-border px-3 py-2"
                >
                  {data.workshops.map((workshop) => (
                    <option key={workshop.id} value={workshop.id}>
                      {workshop.title}
                    </option>
                  ))}
                </select>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="enabled"
                  checked={toggleForm.enabled}
                  onChange={handleToggleFormChange}
                  className="rounded border-border"
                />
                Show this partner on selected workshop landing page
              </label>
              <div>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Workshop Toggle"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Partner Profiles</CardTitle>
        </CardHeader>
        <CardContent>
          {data.partners.length === 0 ? (
            <p className="text-muted-foreground">No partners created yet.</p>
          ) : (
            <div className="space-y-3">
              {data.partners.map((partner) => (
                <div key={partner.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{partner.name}</p>
                      {partner.tagline ? (
                        <p className="text-sm text-primary">{partner.tagline}</p>
                      ) : null}
                      <p className="text-sm text-muted-foreground">{partner.description || "No description"}</p>
                      {partner.logoUrl ? (
                        <a
                          href={partner.logoUrl}
                          target="_blank"
                          className="text-sm text-primary hover:underline"
                        >
                          View logo
                        </a>
                      ) : (
                        <p className="text-sm text-muted-foreground">No logo URL</p>
                      )}
                    </div>
                    <div className="space-y-2 text-right">
                      <Badge variant={partner.isActive ? "default" : "outline"}>
                        {partner.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditPartner(partner)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleActive(partner.id, !partner.isActive)}
                        >
                          {partner.isActive ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeletePartner(partner.id)}
                        >
                          Delete
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Updated {formatDate(partner.updatedAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Partner Visibility by Event</CardTitle>
        </CardHeader>
        <CardContent>
          {togglesWithLabels.length === 0 ? (
            <p className="text-muted-foreground">No partner/event toggles configured yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Workshop
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Partner
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Enabled
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {togglesWithLabels.map((toggle) => (
                    <tr key={`${toggle.workshopId}-${toggle.partnerId}`}>
                      <td className="px-4 py-3 text-sm text-foreground">{toggle.workshopTitle}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{toggle.partnerName}</td>
                      <td className="px-4 py-3">
                        <Badge variant={toggle.enabled ? "default" : "outline"}>
                          {toggle.enabled ? "On" : "Off"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {formatDate(toggle.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
