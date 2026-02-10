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
    Search,
    Bell,
    FileBox
} from "lucide-react";

interface PortalLayoutProps {
    children: React.ReactNode;
}

/**
 * Coach Portal Layout
 * Main shell with navigation for the coach self-service dashboard.
 * Sprint 2: Enhanced with Search, Notifications, and new Navigation items.
 */
export default async function PortalLayout({ children }: PortalLayoutProps) {
    const { session, coach } = await requireCoach();

    // Fallback name if data is missing
    const coachName = coach.firstName || session.user.name || "Coach";

    return (
        <div className="flex min-h-screen bg-gray-100">
            {/* Sidebar */}
            <aside className="w-64 bg-gray-900 text-white flex flex-col fixed inset-y-0 left-0 z-50">
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
            <div className="ml-64 flex-1 flex flex-col min-h-screen">
                <header className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between sticky top-0 z-40 shadow-sm">
                    {/* Global Search - Figma Requirement */}
                    <div className="flex-1 max-w-md relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search workshops, participants..."
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                        />
                    </div>

                    <div className="flex items-center gap-6">
                        {/* Notifications - Figma Requirement */}
                        <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
                            <Bell className="w-5 h-5" />
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                        </button>

                        <div className="h-6 w-px bg-gray-200"></div>

                        <Link
                            href="/api/auth/signout"
                            className="text-sm font-medium text-gray-600 hover:text-red-600 transition-colors"
                        >
                            Sign Out
                        </Link>
                    </div>
                </header>

                <main className="flex-1 p-8">
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
