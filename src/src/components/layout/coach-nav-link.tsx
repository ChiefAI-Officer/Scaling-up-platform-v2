"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isNavLinkActive } from "@/lib/nav-utils";

interface CoachNavLinkProps {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

export function CoachNavLink({ href, icon, children }: CoachNavLinkProps) {
  const pathname = usePathname();
  const isActive = isNavLinkActive(pathname, href);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group cursor-pointer",
        isActive
          ? "bg-sidebar-border text-sidebar-foreground"
          : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-border/80"
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <span
        className={cn(
          "transition-colors duration-200",
          isActive ? "text-white" : "group-hover:text-white"
        )}
      >
        {icon}
      </span>
      <span className={cn("text-sm", isActive ? "font-semibold" : "font-medium")}>
        {children}
      </span>
    </Link>
  );
}
