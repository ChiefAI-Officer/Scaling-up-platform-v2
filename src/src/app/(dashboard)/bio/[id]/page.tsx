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

  // MR-25: Clear all bio fields
  const handleDeleteBio = async () => {
    if (!confirm("Clear all bio fields for this coach? This cannot be undone.")) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const response = await fetch(`/api/coaches/${coachId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: "", profileImage: "", company: "", circleId: null }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Failed to clear bio");
      setFormData((prev) => ({ ...prev, titleCredentials: "", biography: "", profileImageUrl: "", circleId: "" }));
      setSuccess("Bio fields cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear bio");
    } finally {
      setSaving(false);
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
          circleId: formData.circleId.trim() || null,
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
        <p className="text-muted-foreground">Loading coach bio editor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Link href="/dashboard" className="hover:text-foreground">
            Dashboard
          </Link>
          <span>/</span>
          <Link href="/bio" className="hover:text-foreground">
            BIO
          </Link>
          <span>/</span>
          <span className="text-foreground">{coachFullName || "Coach"}</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Bio Page Editor</h1>
        <p className="text-muted-foreground">Edit coach bio details and profile picture.</p>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Coach Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={coachEmail} disabled className="mt-1 bg-muted" />
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
                <Label htmlFor="profileImage">Profile Picture</Label>
                <div className="space-y-2 mt-1">
                  {formData.profileImageUrl && (
                    <img src={formData.profileImageUrl} alt="Current profile" className="w-16 h-16 rounded-full object-cover" />
                  )}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} className="text-sm" />
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
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Bio"}
            </Button>
            {/* MR-25: Delete bio button */}
            <Button variant="destructive" onClick={handleDeleteBio} disabled={saving}>
              Delete Bio
            </Button>
          </div>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-card">
              <div className="p-8 text-center">
                <h2 className="text-sm font-bold tracking-wide text-primary mb-6">
                  SCALING UP COACHES
                </h2>
                {formData.profileImageUrl ? (
                  <img
                    src={formData.profileImageUrl}
                    alt={coachFullName || "Coach"}
                    className="mx-auto h-28 w-28 rounded-full object-cover border-4 border-primary/20"
                  />
                ) : (
                  <div className="mx-auto h-28 w-28 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                    No Image
                  </div>
                )}
                <h3 className="mt-4 text-2xl font-bold text-foreground">
                  {coachFullName || "Coach Name"}
                </h3>
                <p className="text-muted-foreground mt-1">
                  {formData.titleCredentials || "Scaling Up Certified Coach"}
                </p>
                <div className="mt-6 text-left text-sm text-foreground space-y-3 whitespace-pre-wrap">
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
