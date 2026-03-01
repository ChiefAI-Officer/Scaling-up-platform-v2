"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isNavLinkActive } from "@/lib/nav-utils";

interface AdminNavLinksProps {
  links: { href: string; label: string }[];
}

export function AdminNavLinks({ links }: AdminNavLinksProps) {
  const pathname = usePathname();

  return (
    <div className="hidden lg:ml-6 lg:flex lg:space-x-0.5 overflow-x-auto" role="menubar">
      {links.map((link) => {
        const isActive = isNavLinkActive(pathname, link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "inline-flex items-center px-2 py-2 rounded-md text-sm font-medium transition-colors duration-200 whitespace-nowrap cursor-pointer",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              isActive
                ? "bg-primary/10 text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
            )}
            role="menuitem"
            aria-current={isActive ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
