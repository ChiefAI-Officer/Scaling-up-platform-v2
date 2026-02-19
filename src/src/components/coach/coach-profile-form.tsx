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
    };
}

export function CoachProfileForm({ coachId, initialData }: CoachProfileFormProps) {
    const [firstName, setFirstName] = useState(initialData.firstName);
    const [lastName, setLastName] = useState(initialData.lastName);
    const [bio, setBio] = useState(initialData.bio);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch(`/api/portal/profile`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ firstName, lastName, bio }),
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
                {initialData.profileImage ? (
                    <img
                        src={initialData.profileImage}
                        alt={`${initialData.firstName} ${initialData.lastName}`}
                        className="w-16 h-16 rounded-full object-cover"
                    />
                ) : (
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-xl font-medium text-blue-600">
                            {initialData.firstName?.[0]}{initialData.lastName?.[0]}
                        </span>
                    </div>
                )}
                <div>
                    <h2 className="text-lg font-semibold text-foreground">Profile Information</h2>
                    {!initialData.profileImage && (
                        <p className="text-xs text-muted-foreground">Your photo is imported from Circle.so automatically.</p>
                    )}
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
                <Label htmlFor="bio">Professional Bio</Label>
                <Textarea
                    id="bio"
                    placeholder="Tell us about your coaching experience..."
                    className="min-h-[120px]"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                />
            </div>

            <div className="pt-4 border-t border-border flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save Changes"}
                </Button>
            </div>
        </div>
    );
}
