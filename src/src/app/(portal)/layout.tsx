import React from "react";
import Link from "next/link";

interface PortalLayoutProps {
    children: React.ReactNode;
}

/**
 * Coach Portal Layout
 * Main shell with navigation for the coach self-service dashboard.
 */
export default function PortalLayout({ children }: PortalLayoutProps) {
    return (
        <div className="flex min-h-screen">
            {/* Sidebar */}
            <aside className="w-64 bg-gray-800 text-white py-4">
                <div className="px-6 py-4 text-xl font-bold border-b border-white/10 mb-4">
                    Scaling Up Coach
                </div>
                <nav>
                    <ul className="space-y-1">
                        <li>
                            <Link 
                                href="/portal"
                                className="block px-6 py-3 text-white/80 hover:bg-white/10 hover:text-white hover:border-l-[3px] hover:border-blue-400 transition-all"
                            >
                                📊 Dashboard
                            </Link>
                        </li>
                        <li>
                            <Link 
                                href="/portal/workshops"
                                className="block px-6 py-3 text-white/80 hover:bg-white/10 hover:text-white hover:border-l-[3px] hover:border-blue-400 transition-all"
                            >
                                📅 My Workshops
                            </Link>
                        </li>
                        <li>
                            <Link 
                                href="/portal/registrations"
                                className="block px-6 py-3 text-white/80 hover:bg-white/10 hover:text-white hover:border-l-[3px] hover:border-blue-400 transition-all"
                            >
                                👥 Registrations
                            </Link>
                        </li>
                        <li>
                            <Link 
                                href="/portal/request"
                                className="block px-6 py-3 text-white/80 hover:bg-white/10 hover:text-white hover:border-l-[3px] hover:border-blue-400 transition-all"
                            >
                                ➕ Request Workshop
                            </Link>
                        </li>
                        <li>
                            <Link 
                                href="/portal/follow-up"
                                className="block px-6 py-3 text-white/80 hover:bg-white/10 hover:text-white hover:border-l-[3px] hover:border-blue-400 transition-all"
                            >
                                📝 90-Day Follow-Up
                            </Link>
                        </li>
                        <li>
                            <Link 
                                href="/portal/settings"
                                className="block px-6 py-3 text-white/80 hover:bg-white/10 hover:text-white hover:border-l-[3px] hover:border-blue-400 transition-all"
                            >
                                ⚙️ Settings
                            </Link>
                        </li>
                    </ul>
                </nav>
            </aside>

            {/* Main Content */}
            <div className="flex-1 bg-gray-100">
                <header className="bg-white px-8 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h1 className="text-xl font-semibold">Coach Portal</h1>
                    <div>
                        <span>Welcome, Coach</span>
                    </div>
                </header>
                <main className="p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
