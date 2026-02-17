"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, LayoutDashboard, Calendar, Users, PlusCircle, FileText, Settings, FileBox } from "lucide-react";

interface CoachMobileNavProps {
  coachName: string;
}

const navLinks = [
  { href: "/portal/home", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portal/workshops", label: "My Workshops", icon: Calendar },
  { href: "/portal/registrations", label: "Registrations", icon: Users },
  { href: "/portal/templates", label: "Templates", icon: FileBox },
  { href: "/portal/request", label: "Request Workshop", icon: PlusCircle },
  { href: "/portal/follow-up", label: "90-Day Follow-Up", icon: FileText },
  { href: "/portal/settings", label: "Settings", icon: Settings },
];

export function CoachMobileNav({ coachName }: CoachMobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />

          {/* Slide-out panel */}
          <div className="relative w-72 bg-gray-900 text-white flex flex-col">
            <div className="px-6 h-16 flex items-center justify-between border-b border-gray-800">
              <span className="text-lg font-bold">Scaling Up Coach</span>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 py-4 px-3 space-y-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg text-sm font-medium"
                  >
                    <Icon className="w-5 h-5" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-medium uppercase">
                  {coachName.charAt(0)}
                </div>
                <p className="text-sm font-medium truncate">{coachName}</p>
              </div>
              <Link
                href="/api/auth/signout"
                onClick={() => setOpen(false)}
                className="mt-3 block text-center text-sm text-red-400 hover:text-red-300"
              >
                Sign Out
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
