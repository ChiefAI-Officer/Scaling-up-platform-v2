import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import ChangePasswordForm from "@/components/auth/change-password-form";
import { FadeUp } from "@/components/ui/animated";

export default async function AdminSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=/admin/settings");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  return (
    <FadeUp>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Admin Settings</h2>
          <p className="text-sm text-gray-600">
            Manage your account settings.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="mb-2 text-lg font-semibold text-gray-900">Change Password</h3>
          <p className="mb-4 text-sm text-gray-600">
            Signed in as <span className="font-medium">{session.user.email}</span>
          </p>
          <ChangePasswordForm />
        </div>
      </div>
    </FadeUp>
  );
}
