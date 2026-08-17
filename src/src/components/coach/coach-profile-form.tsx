"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type CoachProfileSaveTarget = "self" | "admin";

function errorMessage(error: unknown, fallback: string): string {
    if (typeof error === "string" && error.trim()) {
        return error;
    }

    if (Array.isArray(error)) {
        const issue = error.find(
            (item): item is { message: string } =>
                typeof item === "object" && item !== null && "message" in item
                && typeof item.message === "string" && item.message.trim().length > 0,
        );
        if (issue) {
            return issue.message;
        }
    }

    if (
        typeof error === "object" && error !== null && "message" in error
        && typeof error.message === "string" && error.message.trim()
    ) {
        return error.message;
    }

    return fallback;
}

interface CoachProfileFormProps {
    coachId: string;
    initialData: {
        firstName: string;
        lastName: string;
        email: string;
        bio: string;
        title: string | null;
        company: string | null;
        profileImage?: string | null;
        linkedinUrl?: string | null;
        showBookCallCta?: boolean;
        bookCallUrl?: string | null;
        hubspotId?: string | null;
        circleId?: string | null;
    };
    saveTarget?: CoachProfileSaveTarget;
    /** When true, renders editable Integration IDs section (admin only). Default false. */
    allowEditIntegrationIds?: boolean;
    responsiveEnabled?: boolean;
}

export function CoachProfileForm({
    coachId,
    initialData,
    saveTarget = "self",
    allowEditIntegrationIds = false,
    responsiveEnabled = false,
}: CoachProfileFormProps) {
    const router = useRouter();
    const [firstName, setFirstName] = useState(initialData.firstName);
    const [lastName, setLastName] = useState(initialData.lastName);
    const [bio, setBio] = useState(initialData.bio);
    const [title, setTitle] = useState(initialData.title ?? "");
    const [company, setCompany] = useState(initialData.company ?? "");
    const [linkedinUrl, setLinkedinUrl] = useState(initialData.linkedinUrl || "");
    const [showBookCallCta, setShowBookCallCta] = useState(initialData.showBookCallCta ?? true);
    const [bookCallUrl, setBookCallUrl] = useState(initialData.bookCallUrl ?? "");
    const [profileImage, setProfileImage] = useState(initialData.profileImage || "");
    const [hubspotId, setHubspotId] = useState(initialData.hubspotId ?? "");
    const [circleId, setCircleId] = useState(initialData.circleId ?? "");
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
                setMessage({ type: "error", text: errorMessage(data.error, "Failed to upload photo.") });
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
            const endpoint = saveTarget === "admin"
                ? `/api/coaches/${coachId}`
                : "/api/portal/profile";
            const payload = {
                firstName,
                lastName,
                title: title || null,
                company: company || null,
                linkedinUrl: linkedinUrl || null,
                bio,
                showBookCallCta,
                bookCallUrl: bookCallUrl || null,
                ...(saveTarget === "admin" && allowEditIntegrationIds
                    ? {
                        hubspotId: hubspotId || null,
                        circleId: circleId || null,
                    }
                    : {}),
            };

            const res = await fetch(endpoint, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                setMessage({ type: "error", text: errorMessage(data.error, "Failed to save changes.") });
                return;
            }

            setMessage({ type: "success", text: "Profile updated successfully." });
            router.refresh();
        } catch {
            setMessage({ type: "error", text: "Network error. Please try again." });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={cn("bg-card rounded-xl shadow-sm border border-border p-8 space-y-6", responsiveEnabled && "min-w-0 p-4 sm:p-8")}>
            <div className={cn("flex items-center gap-4", responsiveEnabled && "min-w-0 flex-col items-start sm:flex-row sm:items-center")}>
                {profileImage ? (
                    <img
                        src={profileImage}
                        alt={`${firstName} ${lastName}`}
                        className="w-16 h-16 rounded-full object-cover"
                    />
                ) : (
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-xl font-medium text-primary">
                            {firstName?.[0]}{lastName?.[0]}
                        </span>
                    </div>
                )}
                <div className={cn("flex-1", responsiveEnabled && "w-full min-w-0 max-w-full")}>
                    <h2 className="text-lg font-semibold text-foreground">Profile Information</h2>
                    <div className="mt-1">
                        <label className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer", responsiveEnabled && "min-h-11 w-full min-w-0 max-w-full flex-wrap")}>
                            <span>{uploading ? "Uploading..." : "Upload photo"}</span>
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={handleImageUpload}
                                disabled={uploading}
                                className={cn("text-xs file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/15", responsiveEnabled && "min-h-11 w-full min-w-0 max-w-full file:min-h-11")}
                            />
                        </label>
                    </div>
                </div>
            </div>

            {message && (
                <div className={`px-4 py-3 rounded-lg text-sm ${message.type === "success" ? "bg-success/10 text-success border border-success/20" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
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
                        className={responsiveEnabled ? "min-h-11" : undefined}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className={responsiveEnabled ? "min-h-11" : undefined}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" defaultValue={initialData.email} disabled className={cn("bg-muted", responsiveEnabled && "min-h-11 min-w-0")} />
                <p className="text-xs text-muted-foreground">Contact support to change your email address.</p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="title">Professional Title</Label>
                <Input
                    id="title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g., Scaling Up Certified Coach"
                    className={responsiveEnabled ? "min-h-11" : undefined}
                />
                <p className="text-xs text-muted-foreground mt-1">
                    Your professional title — shown on landing pages
                </p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="company">Company Name</Label>
                <Input
                    id="company"
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                    placeholder="Your company or organization"
                    className={responsiveEnabled ? "min-h-11" : undefined}
                />
                <p className="text-xs text-muted-foreground">The organization or business you represent</p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="linkedinUrl">LinkedIn Profile URL</Label>
                <Input
                    id="linkedinUrl"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/your-profile"
                    className={responsiveEnabled ? "min-h-11" : undefined}
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="bio">Professional Bio</Label>
                <Textarea
                    id="bio"
                    placeholder="Tell us about your coaching experience..."
                    className={cn("min-h-[120px]", responsiveEnabled && "min-w-0")}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                />
            </div>

            <div className={cn("flex items-center gap-2", responsiveEnabled && "min-h-11")}>
                <input
                    id="showBookCallCta"
                    type="checkbox"
                    checked={showBookCallCta}
                    onChange={(e) => setShowBookCallCta(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <Label htmlFor="showBookCallCta" className="cursor-pointer">
                    Show &ldquo;Book a Call&rdquo; button on my bio page
                </Label>
            </div>

            {showBookCallCta && (
                <div className="space-y-1">
                    <Label htmlFor="bookCallUrl">Book a Call URL</Label>
                    <Input
                        id="bookCallUrl"
                        type="url"
                        placeholder="https://calendly.com/yourname"
                        value={bookCallUrl}
                        onChange={(e) => setBookCallUrl(e.target.value)}
                        className={responsiveEnabled ? "min-h-11" : undefined}
                    />
                    <p className="text-xs text-muted-foreground">Link for the button on your public bio page</p>
                </div>
            )}

            {allowEditIntegrationIds && (
                <div className="space-y-4 pt-2">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Integration IDs</h3>
                    <div className="space-y-2">
                        <Label htmlFor="hubspotId">HubSpot Contact ID</Label>
                        <Input
                            id="hubspotId"
                            value={hubspotId}
                            onChange={(e) => setHubspotId(e.target.value)}
                            placeholder="e.g. 12345678"
                            className={responsiveEnabled ? "min-h-11" : undefined}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="circleId">Circle Member ID</Label>
                        <Input
                            id="circleId"
                            value={circleId}
                            onChange={(e) => setCircleId(e.target.value)}
                            placeholder="e.g. circle_abc123"
                            className={responsiveEnabled ? "min-h-11" : undefined}
                        />
                    </div>
                </div>
            )}

            <div className={cn("pt-4 border-t border-border flex justify-end", responsiveEnabled && "flex-col sm:flex-row")}>
                <Button onClick={handleSave} disabled={saving} className={responsiveEnabled ? "min-h-11 w-full sm:w-auto" : undefined}>
                    {saving ? "Saving..." : "Save Changes"}
                </Button>
            </div>
        </div>
    );
}
