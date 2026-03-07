"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavLinkActive } from "@/lib/nav-utils";
import { coachPrimaryNavItems } from "@/lib/coach-nav";

interface CoachMobileNavProps {
  coachName: string;
}

export function CoachMobileNav({ coachName }: CoachMobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
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
          <div className="relative w-72 bg-sidebar text-sidebar-foreground flex flex-col">
            <div className="px-6 h-16 flex items-center justify-between border-b border-sidebar-border">
              <span className="text-lg font-bold">Scaling Up Coach</span>
              <button onClick={() => setOpen(false)} className="text-sidebar-muted hover:text-sidebar-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 py-4 px-3 space-y-1">
              {coachPrimaryNavItems.map((link) => {
                const Icon = link.icon;
                const isActive = isNavLinkActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors duration-200 cursor-pointer",
                      isActive
                        ? "bg-sidebar-border text-sidebar-foreground font-semibold"
                        : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-border font-medium"
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className={cn("w-5 h-5", isActive && "text-white")} />
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-sidebar-border">
              <Link
                href="/portal/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 hover:bg-sidebar-border/50 rounded-lg p-1 -m-1 transition-colors duration-200 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-medium uppercase">
                  {coachName.charAt(0)}
                </div>
                <p className="text-sm font-medium truncate">{coachName}</p>
              </Link>
              <button
                onClick={() => { setOpen(false); void signOut({ callbackUrl: "/login" }); }}
                className="mt-3 block w-full text-center text-sm text-destructive hover:text-destructive/80"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
