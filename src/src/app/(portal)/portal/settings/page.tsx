import { requireCoach } from "@/lib/authorization";
import ChangePasswordForm from "@/components/auth/change-password-form";
import { CoachProfileForm } from "@/components/coach/coach-profile-form";

export default async function SettingsPage() {
    const { coach } = await requireCoach();

    return (
        <div className="max-w-2xl">
            <h1 className="text-2xl font-bold text-foreground mb-6">Coach Settings</h1>

            <div className="space-y-6">
                <CoachProfileForm
                    coachId={coach.id}
                    initialData={{
                        firstName: coach.firstName || "",
                        lastName: coach.lastName || "",
                        email: coach.email,
                        bio: coach.bio || "",
                        titleCredentials: coach.company || null, // MR-26
                        profileImage: coach.profileImage || null,
                        linkedinUrl: coach.linkedinUrl || null,
                        showBookCallCta: coach.showBookCallCta,
                    }}
                />

                <div className="bg-card rounded-xl shadow-sm border border-border p-8">
                    <h2 className="text-lg font-semibold text-foreground mb-4">Change Password</h2>
                    <ChangePasswordForm />
                </div>
            </div>
        </div>
    );
}
