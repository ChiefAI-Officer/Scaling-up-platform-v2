import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import ChangeAdminPasswordForm from "./change-admin-password-form";

export default async function AdminSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=/admin/settings");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  const configuredAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const userEmail = session.user.email.toLowerCase();
  const isCanonicalAdmin = !configuredAdminEmail || userEmail === configuredAdminEmail;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Admin Settings</h2>
        <p className="text-sm text-gray-600">
          Manage security settings for the canonical admin account.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-2 text-lg font-semibold text-gray-900">Change Password</h3>
        <p className="mb-4 text-sm text-gray-600">
          Signed in as <span className="font-medium">{session.user.email}</span>
        </p>

        {isCanonicalAdmin ? (
          <ChangeAdminPasswordForm />
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            This account is not the canonical admin account configured by{" "}
            <code>ADMIN_EMAIL</code>. Password management is restricted.
          </div>
        )}
      </div>
    </div>
  );
}
