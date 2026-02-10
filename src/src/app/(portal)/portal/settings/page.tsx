import { db } from "@/lib/db";
import { requireCoach } from "@/lib/authorization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default async function SettingsPage() {
    const { coach } = await requireCoach();

    // For Sprint 2, we render the form. 
    // Ideally this would be a client component for interactivity/submission, 
    // or use Server Actions. 
    // I'll make a simple server-rendered view with a placeholder "Save" button for now, 
    // or a client component if I want it functional immediately.
    // Given time, I'll stick to a nice read-only view or basic form structure 
    // that can be easily wired up.

    return (
        <div className="max-w-2xl">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Coach Settings</h1>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-8">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="firstName">First Name</Label>
                            <Input id="firstName" defaultValue={coach.firstName || ""} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lastName">Last Name</Label>
                            <Input id="lastName" defaultValue={coach.lastName || ""} />
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" defaultValue={coach.email} disabled className="bg-gray-50" />
                    <p className="text-xs text-gray-500">Contact support to change your email address.</p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="bio">Professional Bio</Label>
                    <Textarea
                        id="bio"
                        placeholder="Tell us about your coaching experience..."
                        className="min-h-[120px]"
                        defaultValue={coach.bio || ""}
                    />
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-end">
                    <Button>Save Changes</Button>
                </div>
            </div>
        </div>
    );
}
