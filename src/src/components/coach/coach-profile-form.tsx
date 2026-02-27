"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface CoachProfileFormProps {
    coachId: string;
    initialData: {
        firstName: string;
        lastName: string;
        email: string;
        bio: string;
        profileImage?: string | null;
        linkedinUrl?: string | null;
        showBookCallCta?: boolean;
    };
}

export function CoachProfileForm({ coachId, initialData }: CoachProfileFormProps) {
    const [firstName, setFirstName] = useState(initialData.firstName);
    const [lastName, setLastName] = useState(initialData.lastName);
    const [bio, setBio] = useState(initialData.bio);
    const [linkedinUrl, setLinkedinUrl] = useState(initialData.linkedinUrl || "");
    const [showBookCallCta, setShowBookCallCta] = useState(initialData.showBookCallCta ?? true);
    const [profileImage, setProfileImage] = useState(initialData.profileImage || "");
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            setMessage({ type: "error", text: "Image must be under 5 MB." });
            return;
        }

        setUploading(true);
        setMessage(null);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch("/api/portal/profile/image", { method: "POST", body: formData });
            const data = await res.json();

            if (res.ok && data.success) {
                setProfileImage(data.url);
                setMessage({ type: "success", text: "Photo uploaded successfully." });
            } else {
                setMessage({ type: "error", text: data.error || "Failed to upload photo." });
            }
        } catch {
            setMessage({ type: "error", text: "Network error uploading photo." });
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch(`/api/portal/profile`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ firstName, lastName, bio, linkedinUrl: linkedinUrl || null, showBookCallCta }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setMessage({ type: "success", text: "Profile updated successfully." });
            } else {
                setMessage({ type: "error", text: data.error || "Failed to save changes." });
            }
        } catch {
            setMessage({ type: "error", text: "Network error. Please try again." });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-card rounded-xl shadow-sm border border-border p-8 space-y-6">
            <div className="flex items-center gap-4">
                {profileImage ? (
                    <img
                        src={profileImage}
                        alt={`${firstName} ${lastName}`}
                        className="w-16 h-16 rounded-full object-cover"
                    />
                ) : (
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-xl font-medium text-blue-600">
                            {firstName?.[0]}{lastName?.[0]}
                        </span>
                    </div>
                )}
                <div className="flex-1">
                    <h2 className="text-lg font-semibold text-foreground">Profile Information</h2>
                    <div className="mt-1">
                        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                            <span>{uploading ? "Uploading..." : "Upload photo"}</span>
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={handleImageUpload}
                                disabled={uploading}
                                className="text-xs file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                            />
                        </label>
                    </div>
                </div>
            </div>

            {message && (
                <div className={`px-4 py-3 rounded-lg text-sm ${message.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                    {message.text}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" defaultValue={initialData.email} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">Contact support to change your email address.</p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="linkedinUrl">LinkedIn Profile URL</Label>
                <Input
                    id="linkedinUrl"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/your-profile"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="bio">Professional Bio</Label>
                <Textarea
                    id="bio"
                    placeholder="Tell us about your coaching experience..."
                    className="min-h-[120px]"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                />
            </div>

            <div className="flex items-center gap-2">
                <input
                    id="showBookCallCta"
                    type="checkbox"
                    checked={showBookCallCta}
                    onChange={(e) => setShowBookCallCta(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="showBookCallCta" className="cursor-pointer">
                    Show &ldquo;Book a Call&rdquo; button on my bio page
                </Label>
            </div>

            <div className="pt-4 border-t border-border flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save Changes"}
                </Button>
            </div>
        </div>
    );
}
