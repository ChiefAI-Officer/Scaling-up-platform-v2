"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavLinkActive } from "@/lib/nav-utils";

interface AdminMobileNavProps {
  links: { href: string; label: string }[];
  email: string;
}

export function AdminMobileNav({ links, email }: AdminMobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {open && (
        <div className="absolute top-16 inset-x-0 bg-card border-b shadow-lg z-50">
          <div className="px-4 py-3 space-y-1">
            {links.map((link) => {
              const isActive = isNavLinkActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors duration-200",
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-foreground hover:bg-accent/60"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="border-t pt-2 mt-2 space-y-1">
              <p className="px-3 py-1 text-xs text-muted-foreground">{email}</p>
              <Link
                href="/admin/settings"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg text-foreground hover:bg-accent text-sm font-medium"
              >
                Settings
              </Link>
              <button
                onClick={() => { setOpen(false); void signOut({ callbackUrl: "/login" }); }}
                className="block w-full text-left px-3 py-2 rounded-lg text-destructive hover:bg-destructive/10 text-sm font-medium"
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
