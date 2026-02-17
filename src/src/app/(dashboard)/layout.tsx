import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminMobileNav } from "@/components/layout/admin-mobile-nav";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/workshops", label: "Workshops" },
  { href: "/coaches", label: "Coaches" },
  { href: "/templates", label: "Templates" },
  { href: "/admin/workflows", label: "Workflows" },
  { href: "/admin/surveys", label: "Surveys" },
  { href: "/admin/files", label: "Files" },
  { href: "/partners", label: "Partners" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  if (!session.user?.role || session.user.role === "COACH") {
    redirect("/unauthorized");
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg"
      >
        Skip to main content
      </a>

      {/* Navigation */}
      <nav
        className="bg-white shadow-sm border-b"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <Link
                  href="/dashboard"
                  className="text-xl font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                  aria-label="Scaling Up - Go to Dashboard"
                >
                  Scaling Up
                </Link>
              </div>
              {/* Desktop nav */}
              <div className="hidden md:ml-8 md:flex md:space-x-6" role="menubar">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    role="menuitem"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden sm:inline text-sm text-gray-600" aria-label="Logged in user">
                {session.user.email}
              </span>
              <Link
                href="/admin/settings"
                className="hidden md:inline text-sm text-gray-500 hover:text-gray-700"
              >
                Settings
              </Link>
              <Link
                href="/api/auth/signout"
                className="hidden md:inline text-sm text-red-500 hover:text-red-700"
              >
                Sign Out
              </Link>
              {/* Mobile hamburger */}
              <AdminMobileNav links={navLinks} email={session.user.email || ""} />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main
        id="main-content"
        className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8"
        role="main"
        aria-label="Page content"
      >
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto" role="contentinfo">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-sm text-gray-500 text-center">
            Scaling Up Workshop Platform v1.0.0
          </p>
        </div>
      </footer>
    </div>
  );
}
