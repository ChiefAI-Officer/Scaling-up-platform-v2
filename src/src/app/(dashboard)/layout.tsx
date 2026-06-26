import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { AdminMobileNav } from "@/components/layout/admin-mobile-nav";
import { AdminNavLinks } from "@/components/layout/admin-nav-links";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { getAdminNavBadgeCounts } from "@/lib/nav/admin-nav-badges";

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

  const counts = await getAdminNavBadgeCounts();

  const userInitial = (session.user.name || session.user.email || "A").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg"
      >
        Skip to main content
      </a>

      {/* Navigation */}
      <nav
        className="bg-card border-b sticky top-0 z-40 backdrop-blur-sm bg-card/95"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center min-w-0">
              <div className="flex-shrink-0 flex items-center">
                <Link
                  href="/admin/dashboard"
                  className="text-xl font-bold text-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded whitespace-nowrap"
                  aria-label="Scaling Up - Go to Dashboard"
                >
                  Scaling Up
                </Link>
              </div>
              {/* Desktop nav */}
              <AdminNavLinks counts={counts} />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="hidden xl:inline text-sm text-muted-foreground max-w-[180px] truncate" aria-label="Logged in user">
                {session.user.email}
              </span>
              <ThemeToggle />
              <Separator orientation="vertical" className="hidden xl:block h-5" />
              <div className="hidden xl:flex items-center gap-2">
                <Link
                  href="/admin/settings"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 whitespace-nowrap"
                >
                  Settings
                </Link>
                <SignOutButton className="text-sm text-destructive hover:text-destructive/80 transition-colors duration-200 whitespace-nowrap" />
              </div>
              <div className="hidden xl:flex h-8 w-8 rounded-full bg-primary/10 text-primary items-center justify-center text-sm font-semibold flex-shrink-0">
                {userInitial}
              </div>
              {/* Mobile/tablet hamburger */}
              <AdminMobileNav counts={counts} email={session.user.email || ""} />
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
      <footer className="bg-card border-t mt-auto" role="contentinfo">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-xs text-muted-foreground text-center">
            Scaling Up Workshop Platform v2.0
          </p>
        </div>
      </footer>
    </div>
  );
}
