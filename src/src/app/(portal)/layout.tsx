// Sprint 2: Figma Alignment - Updated Navigation & Header
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

interface PortalLayoutProps {
    children: React.ReactNode;
}

/**
 * Coach Portal Layout
 * Main shell with navigation for the coach self-service dashboard.
 */
export default async function PortalLayout({ children }: PortalLayoutProps) {
    const { session, coach } = await requireCoach();

    const coachName = coach.firstName || session.user.name || "Coach";

    return (
        <div className="flex min-h-screen bg-gray-100">
            {/* Sidebar — hidden on mobile */}
            <aside className="hidden md:flex w-64 bg-gray-900 text-white flex-col fixed inset-y-0 left-0 z-50">
                <div className="px-6 h-16 flex items-center border-b border-gray-800">
                    <span className="text-xl font-bold tracking-tight">Scaling Up Coach</span>
                </div>

                <nav className="flex-1 py-6 px-4 space-y-1">
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

                    <div className="pt-4 mt-4 border-t border-gray-800">
                        <NavLink href="/portal/settings" icon={<Settings className="w-5 h-5" />}>
                            Settings
                        </NavLink>
                    </div>
                </nav>

                <div className="p-4 border-t border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-medium uppercase">
                            {coachName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{coachName}</p>
                            <p className="text-xs text-gray-400 truncate">Coach</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="md:ml-64 flex-1 flex flex-col min-h-screen">
                <header className="h-16 bg-white border-b border-gray-200 px-4 md:px-8 flex items-center justify-between sticky top-0 z-40 shadow-sm">
                    {/* Mobile hamburger */}
                    <CoachMobileNav coachName={coachName} />

                    {/* Title on mobile */}
                    <span className="md:hidden text-lg font-bold text-gray-900">Scaling Up</span>

                    {/* Spacer on desktop */}
                    <div className="hidden md:block flex-1" />

                    <div className="flex items-center gap-4 md:gap-6">
                        <div className="h-6 w-px bg-gray-200 hidden md:block"></div>
                        <Link
                            href="/api/auth/signout"
                            className="text-sm font-medium text-gray-600 hover:text-red-600 transition-colors"
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
            className="flex items-center gap-3 px-4 py-2.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors group"
        >
            <span className="group-hover:text-white transition-colors">{icon}</span>
            <span className="font-medium">{children}</span>
        </Link>
    );
}

function NavSeparator() {
    return <div className="my-2 border-t border-gray-800/50" />;
}
