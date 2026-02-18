"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

interface AdminMobileNavProps {
  links: { href: string; label: string }[];
  email: string;
}

export function AdminMobileNav({ links, email }: AdminMobileNavProps) {
  const [open, setOpen] = useState(false);

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
        <div className="absolute top-16 inset-x-0 bg-card border-b shadow-lg z-50">
          <div className="px-4 py-3 space-y-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg text-foreground hover:bg-accent text-sm font-medium"
              >
                {link.label}
              </Link>
            ))}
            <div className="border-t pt-2 mt-2 space-y-1">
              <p className="px-3 py-1 text-xs text-muted-foreground">{email}</p>
              <Link
                href="/admin/settings"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg text-foreground hover:bg-accent text-sm font-medium"
              >
                Settings
              </Link>
              <Link
                href="/api/auth/signout"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 text-sm font-medium"
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
