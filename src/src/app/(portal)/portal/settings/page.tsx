import { requireCoach } from "@/lib/auth/authorization";
import { getCoachBioMissingFields } from "@/lib/validations";
import ChangePasswordForm from "@/components/auth/change-password-form";
import { CoachProfileForm } from "@/components/coach/coach-profile-form";

export default async function SettingsPage() {
    const { coach } = await requireCoach();

    const missingFields = getCoachBioMissingFields(coach);
    const bioFields = [
        { label: "First Name", complete: !!coach.firstName },
        { label: "Last Name", complete: !!coach.lastName },
        { label: "Email", complete: !!coach.email },
        { label: "Professional Title", complete: !!coach.title },
        { label: "LinkedIn URL", complete: !!coach.linkedinUrl },
        { label: "Bio (10+ chars)", complete: !!coach.bio && coach.bio.length >= 10 },
        { label: "Profile Photo", complete: !!coach.profileImage },
    ];

    return (
        <div className="max-w-2xl">
            <h1 className="text-2xl font-bold text-foreground mb-6">Coach Settings</h1>

            <div className="space-y-6">
                {/* Bio Completeness Checklist */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Profile Completeness
                    </h2>
                    <div className="space-y-1.5">
                        {bioFields.map((field) => (
                            <div key={field.label} className="flex items-center gap-2 text-sm">
                                <span className={field.complete ? "text-success" : "text-destructive"}>
                                    {field.complete ? "\u2713" : "\u2717"}
                                </span>
                                <span className={field.complete ? "text-foreground" : "text-muted-foreground"}>
                                    {field.label}
                                </span>
                            </div>
                        ))}
                    </div>
                    {missingFields.length > 0 && (
                        <p className="mt-3 text-sm text-destructive">
                            Complete all required fields to request workshops
                        </p>
                    )}
                </div>

                <CoachProfileForm
                    coachId={coach.id}
                    initialData={{
                        firstName: coach.firstName || "",
                        lastName: coach.lastName || "",
                        email: coach.email,
                        bio: coach.bio || "",
                        title: coach.title || null,
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
