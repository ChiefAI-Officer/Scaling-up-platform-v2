import React from "react";
import Link from "next/link";
import { requireCoach } from "@/lib/authorization";
import {
    LayoutDashboard,
    Calendar,
    Users,
    PlusCircle,
    FileText,
    Settings,
    FileBox
} from "lucide-react";
import { CoachMobileNav } from "@/components/layout/coach-mobile-nav";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface PortalLayoutProps {
    children: React.ReactNode;
}

export default async function PortalLayout({ children }: PortalLayoutProps) {
    const { session, coach } = await requireCoach();

    const coachName = coach.firstName || session.user.name || "Coach";

    return (
        <div className="flex min-h-screen bg-background">
            {/* Sidebar — hidden on mobile */}
            <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col fixed inset-y-0 left-0 z-50">
                <div className="px-6 h-16 flex items-center border-b border-slate-800">
                    <span className="text-lg font-bold tracking-tight">Scaling Up Coach</span>
                </div>

                <nav className="flex-1 py-6 px-3 space-y-1">
                    <NavLink href="/portal/home" icon={<LayoutDashboard className="w-5 h-5" />}>
                        Dashboard
                    </NavLink>
                    <NavLink href="/portal/workshops" icon={<Calendar className="w-5 h-5" />}>
                        My Workshops
                    </NavLink>
                    <NavLink href="/portal/registrations" icon={<Users className="w-5 h-5" />}>
                        Registrations
                    </NavLink>
                    <NavLink href="/portal/templates" icon={<FileBox className="w-5 h-5" />}>
                        Templates
                    </NavLink>
                    <NavSeparator />
                    <NavLink href="/portal/request" icon={<PlusCircle className="w-5 h-5" />}>
                        Request Workshop
                    </NavLink>
                    <NavLink href="/portal/follow-up" icon={<FileText className="w-5 h-5" />}>
                        90-Day Follow-Up
                    </NavLink>

                    <div className="pt-4 mt-4 border-t border-slate-800">
                        <NavLink href="/portal/settings" icon={<Settings className="w-5 h-5" />}>
                            Settings
                        </NavLink>
                    </div>
                </nav>

                <div className="p-4 border-t border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-sm font-semibold text-primary-foreground uppercase">
                            {coachName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{coachName}</p>
                            <p className="text-xs text-slate-400 truncate">Coach</p>
                        </div>
                    </div>
                </div>
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
                            href="/api/auth/signout"
                            className="text-sm font-medium text-muted-foreground hover:text-destructive transition-colors duration-200"
                        >
                            Sign Out
                        </Link>
                    </div>
                </header>

                <main className="flex-1 p-4 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}

function NavLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="flex items-center gap-3 px-4 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg transition-all duration-200 group"
        >
            <span className="group-hover:text-white transition-colors duration-200">{icon}</span>
            <span className="font-medium text-sm">{children}</span>
        </Link>
    );
}

function NavSeparator() {
    return <div className="my-3 border-t border-slate-800/50" />;
}
