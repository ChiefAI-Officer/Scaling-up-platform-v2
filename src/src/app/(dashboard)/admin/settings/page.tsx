import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth";
import ChangePasswordForm from "@/components/auth/change-password-form";
import { InviteAdminSection } from "@/components/admin/invite-admin-section";
import { isWaveQAdminControlsEnabled } from "@/lib/assessments/wave-q-flags";
import { FadeUp } from "@/components/ui/animated";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";
import { PageHeader } from "@/components/ui/page-header";

export default async function AdminSettingsPage() {
  const mobileResponsiveEnabled = isMobileResponsiveEnabled();
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=/admin/settings");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  return (
    <FadeUp>
      <div className={mobileResponsiveEnabled ? "mx-auto min-w-0 max-w-2xl space-y-6" : "mx-auto max-w-2xl space-y-6"}>
        {mobileResponsiveEnabled ? <PageHeader responsiveEnabled title="Admin Settings" description="Manage your account settings." /> : <div>
          <h2 className="text-2xl font-bold text-foreground">Admin Settings</h2>
          <p className="text-sm text-muted-foreground">
            Manage your account settings.
          </p>
        </div>}

        <div className={mobileResponsiveEnabled ? "min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6" : "rounded-xl border border-border bg-card p-6"}>
          <h3 className="mb-2 text-lg font-semibold text-foreground">Change Password</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Signed in as <span className="font-medium">{session.user.email}</span>
          </p>
          <ChangePasswordForm responsiveEnabled={mobileResponsiveEnabled} />
        </div>

        {/* Wave Q (#7): the flag gates only the remove CAPABILITY — server
            enforcement of an already-removed user stays unconditional. */}
        <InviteAdminSection waveQEnabled={isWaveQAdminControlsEnabled()} responsiveEnabled={mobileResponsiveEnabled} />
      </div>
    </FadeUp>
  );
}
