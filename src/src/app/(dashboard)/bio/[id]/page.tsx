"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface CoachPayload {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string | null;
  bio: string | null;
  profileImage: string | null;
  circleId: string | null;
}

interface BioEditorForm {
  firstName: string;
  lastName: string;
  titleCredentials: string;
  biography: string;
  profileImageUrl: string;
  circleId: string;
}

export default function CoachBioEditorPage() {
  const params = useParams();
  const coachId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [coachEmail, setCoachEmail] = useState("");
  const [formData, setFormData] = useState<BioEditorForm>({
    firstName: "",
    lastName: "",
    titleCredentials: "",
    biography: "",
    profileImageUrl: "",
    circleId: "",
  });

  const coachFullName = useMemo(
    () => `${formData.firstName} ${formData.lastName}`.trim(),
    [formData.firstName, formData.lastName]
  );

  useEffect(() => {
    async function loadCoach() {
      try {
        setError(null);
        const response = await fetch(`/api/coaches/${coachId}`);
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to load coach");
        }

        const coach = data.data as CoachPayload;
        setCoachEmail(coach.email);
        setFormData({
          firstName: coach.firstName || "",
          lastName: coach.lastName || "",
          titleCredentials: coach.company || "",
          biography: coach.bio || "",
          profileImageUrl: coach.profileImage || "",
          circleId: coach.circleId || "",
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load coach");
      } finally {
        setLoading(false);
      }
    }

    if (coachId) {
      void loadCoach();
    }
  }, [coachId]);

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setSuccess(null);
  };

  const handleImportFromCircle = async () => {
    try {
      setImporting(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/coaches/${coachId}/circle-import`, {
        method: "POST",
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to import from Circle");
      }

      setFormData((prev) => ({
        ...prev,
        firstName: data.data.firstName || prev.firstName,
        lastName: data.data.lastName || prev.lastName,
        titleCredentials: data.data.titleCredentials || prev.titleCredentials,
        biography: data.data.biography || prev.biography,
        profileImageUrl: data.data.profileImageUrl || prev.profileImageUrl,
        circleId: data.data.circleId || prev.circleId,
      }));

      setSuccess("Imported profile data from Circle. Review and click Save Bio.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import from Circle");
    } finally {
      setImporting(false);
    }
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      uploadFormData.append("type", "profile");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: uploadFormData,
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to upload image");
      }

      setFormData((prev) => ({ ...prev, profileImageUrl: data.url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image");
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/coaches/${coachId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          company: formData.titleCredentials.trim(),
          bio: formData.biography.trim(),
          profileImage: formData.profileImageUrl.trim(),
          circleId: formData.circleId.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to save coach bio");
      }

      setSuccess("Coach bio profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save coach bio");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-gray-500">Loading coach bio editor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <Link href="/dashboard" className="hover:text-gray-700">
            Dashboard
          </Link>
          <span>/</span>
          <Link href="/bio" className="hover:text-gray-700">
            BIO
          </Link>
          <span>/</span>
          <span className="text-gray-900">{coachFullName || "Coach"}</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Bio Page Editor</h1>
        <p className="text-gray-600">Edit coach bio details and import data from Circle.</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Coach Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={coachEmail} disabled className="mt-1 bg-gray-50" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="titleCredentials">Title / Credentials</Label>
                <Input
                  id="titleCredentials"
                  name="titleCredentials"
                  value={formData.titleCredentials}
                  onChange={handleChange}
                  placeholder="Scaling Up Certified Coach"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="profileImageUrl">Profile Picture</Label>
                <div className="space-y-2 mt-1">
                  <Input
                    id="profileImageUrl"
                    name="profileImageUrl"
                    value={formData.profileImageUrl}
                    onChange={handleChange}
                    placeholder="https://..."
                  />
                  <input type="file" accept="image/*" onChange={handleImageUpload} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Biography</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="biography">Biography Text</Label>
              <Textarea
                id="biography"
                name="biography"
                value={formData.biography}
                onChange={handleChange}
                rows={10}
                className="mt-1"
                placeholder="Add coach biography..."
              />
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleImportFromCircle} disabled={importing}>
              {importing ? "Importing..." : "Import from Circle"}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Bio"}
            </Button>
          </div>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-white">
              <div className="p-8 text-center">
                <h2 className="text-sm font-bold tracking-wide text-purple-700 mb-6">
                  SCALING UP COACHES
                </h2>
                {formData.profileImageUrl ? (
                  <img
                    src={formData.profileImageUrl}
                    alt={coachFullName || "Coach"}
                    className="mx-auto h-28 w-28 rounded-full object-cover border-4 border-purple-100"
                  />
                ) : (
                  <div className="mx-auto h-28 w-28 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
                    No Image
                  </div>
                )}
                <h3 className="mt-4 text-2xl font-bold text-gray-900">
                  {coachFullName || "Coach Name"}
                </h3>
                <p className="text-gray-600 mt-1">
                  {formData.titleCredentials || "Scaling Up Certified Coach"}
                </p>
                <div className="mt-6 text-left text-sm text-gray-700 space-y-3 whitespace-pre-wrap">
                  {formData.biography || "Biography preview will appear here."}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
