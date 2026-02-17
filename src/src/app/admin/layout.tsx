import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

interface AdminLayoutProps {
    children: React.ReactNode;
}

interface UserWithRole {
    role?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
}

/**
 * Admin Panel Layout
 * Used by Suzanne for managing workshops, approvals, and platform operations.
 * Protected - requires admin role.
 */
export default async function AdminLayout({ children }: AdminLayoutProps) {
    // Verify admin authentication
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/login?callbackUrl=/admin/dashboard");
    }

    // Check for admin role
    const userRole = (session.user as UserWithRole)?.role;
    if (userRole !== "ADMIN" && userRole !== "STAFF") {
        redirect("/unauthorized");
    }

    const userName = session.user?.name || "Admin";
    
    // Fetch pending approval count
    let pendingCount = 0;
    try {
        pendingCount = await db.approvalQueue.count({
            where: { status: "PENDING" }
        });
    } catch (error) {
        console.error("Failed to fetch pending approvals:", error);
    }
    
    return (
        <div className="flex min-h-screen">
            {/* Sidebar */}
            <aside className="w-64 bg-purple-900 text-white py-4">
                <div className="px-6 py-4 text-xl font-bold border-b border-white/10 mb-4">
                    ⚡ Admin Panel
                </div>
                <nav>
                    <ul className="space-y-1">
                        <li>
                            <Link 
                                href="/admin/dashboard"
                                className="block px-6 py-3 text-white/80 hover:bg-white/10 hover:text-white hover:border-l-[3px] hover:border-purple-400 transition-all"
                            >
                                📊 Dashboard
                            </Link>
                        </li>
                        <li>
                            <Link 
                                href="/admin/approvals"
                                className="block px-6 py-3 text-white/80 hover:bg-white/10 hover:text-white hover:border-l-[3px] hover:border-purple-400 transition-all"
                            >
                                ✅ Approvals
                                {pendingCount > 0 && (
                                    <span className="ml-2 bg-red-500 text-white px-2 py-0.5 rounded-full text-xs">
                                        {pendingCount}
                                    </span>
                                )}
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/admin/categories"
                                className="block px-6 py-3 text-white/80 hover:bg-white/10 hover:text-white hover:border-l-[3px] hover:border-purple-400 transition-all"
                            >
                                🏷️ Categories
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/admin/pricing"
                                className="block px-6 py-3 text-white/80 hover:bg-white/10 hover:text-white hover:border-l-[3px] hover:border-purple-400 transition-all"
                            >
                                💰 Pricing Tiers
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/admin/financials"
                                className="block px-6 py-3 text-white/80 hover:bg-white/10 hover:text-white hover:border-l-[3px] hover:border-purple-400 transition-all"
                            >
                                💵 Financials
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/dashboard"
                                className="block px-6 py-3 text-white/80 hover:bg-white/10 hover:text-white hover:border-l-[3px] hover:border-purple-400 transition-all"
                            >
                                🧭 Operations Dashboard
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/admin/settings"
                                className="block px-6 py-3 text-white/80 hover:bg-white/10 hover:text-white hover:border-l-[3px] hover:border-purple-400 transition-all"
                            >
                                🔐 Settings
                            </Link>
                        </li>
                    </ul>
                </nav>
            </aside>

            {/* Main Content */}
            <div className="flex-1 bg-purple-50">
                <header className="bg-white px-8 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h1 className="text-xl font-semibold">Scaling Up Admin</h1>
                    <div>
                        <span>Welcome, {userName}</span>
                    </div>
                </header>
                <main className="p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
