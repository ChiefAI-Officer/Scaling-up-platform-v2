import React from "react";
import Link from "next/link";
import { requireCoach } from "@/lib/auth/authorization";
import { CoachMobileNav } from "@/components/layout/coach-mobile-nav";
import { CoachNavLink } from "@/components/layout/coach-nav-link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { coachAccountNavItem, coachPrimaryNavItems } from "@/lib/coach-nav";

interface PortalLayoutProps {
    children: React.ReactNode;
}

export default async function PortalLayout({ children }: PortalLayoutProps) {
    const { session, coach } = await requireCoach();

    const coachName = coach.firstName || session.user.name || "Coach";
    const AccountIcon = coachAccountNavItem.icon;

    return (
        <div className="flex min-h-screen bg-background">
            {/* Sidebar — hidden on mobile */}
            <aside className="hidden md:flex w-64 bg-sidebar text-sidebar-foreground flex-col fixed inset-y-0 left-0 z-50">
                <div className="px-6 h-16 flex items-center border-b border-sidebar-border">
                    <span className="text-lg font-bold tracking-tight">Scaling Up Coach</span>
                </div>

                <nav className="flex-1 py-6 px-3 space-y-1">
                    {coachPrimaryNavItems.map((item) => {
                        const Icon = item.icon;

                        return (
                            <CoachNavLink key={item.href} href={item.href} icon={<Icon className="w-5 h-5" />}>
                                {item.label}
                            </CoachNavLink>
                        );
                    })}
                    <NavSeparator />

                    <div className="pt-4 mt-4 border-t border-sidebar-border">
                        <CoachNavLink
                            href={coachAccountNavItem.href}
                            icon={<AccountIcon className="w-5 h-5" />}
                        >
                            {coachAccountNavItem.label}
                        </CoachNavLink>
                    </div>
                </nav>

                <Link href="/portal/settings" className="block p-4 border-t border-sidebar-border hover:bg-sidebar-border/50 transition-colors duration-200 cursor-pointer">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-sm font-semibold text-primary-foreground uppercase">
                            {coachName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{coachName}</p>
                            <p className="text-xs text-sidebar-muted truncate">Coach</p>
                        </div>
                    </div>
                </Link>
            </aside>

            {/* Main Content */}
            <div className="md:ml-64 flex-1 flex flex-col min-h-screen">
                <header className="h-16 bg-card border-b px-4 md:px-8 flex items-center justify-between sticky top-0 z-40 backdrop-blur-sm bg-card/95">
                    {/* Mobile hamburger */}
                    <CoachMobileNav coachName={coachName} />

                    {/* Title on mobile */}
                    <span className="md:hidden text-lg font-bold text-foreground">Scaling Up</span>

                    {/* Spacer on desktop */}
                    <div className="hidden md:block flex-1" />

                    <div className="flex items-center gap-4 md:gap-6">
                        <ThemeToggle />
                        <div className="h-5 w-px bg-border hidden md:block" />
                        <Link
                            href="/portal/settings"
                            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 hidden md:inline"
                        >
                            Settings
                        </Link>
                        <SignOutButton className="text-sm font-medium text-muted-foreground hover:text-destructive transition-colors duration-200" />
                    </div>
                </header>

                <main className="flex-1 p-4 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}

function NavSeparator() {
    return <div className="my-3 border-t border-sidebar-border/50" />;
}
