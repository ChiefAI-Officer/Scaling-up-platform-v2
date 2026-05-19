"use client";

/**
 * AssessmentsNavLink — sidebar link with usePathname-based active state.
 *
 * Modeled after components/layout/coach-nav-link.tsx. Pulled into a separate
 * component because active-state detection requires usePathname (client-only)
 * but the parent AssessmentsSidebar stays a server component so it can read
 * the NextAuth session without prop-drilling.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isNavLinkActive } from "@/lib/nav-utils";

interface AssessmentsNavLinkProps {
  href: string;
  label: string;
  /**
   * When true, the link is treated as active ONLY on an exact pathname
   * match. Used by the "Dashboard" row so /admin/assessments/templates
   * does not also light up the Dashboard row.
   */
  exact?: boolean;
}

export function AssessmentsNavLink({
  href,
  label,
  exact = false,
}: AssessmentsNavLinkProps) {
  const pathname = usePathname();
  const isActive = exact
    ? pathname === href
    : isNavLinkActive(pathname, href);

  return (
    <Link
      href={href}
      className={cn(
        "block rounded-md px-3 py-2 text-sm transition-colors duration-150",
        isActive
          ? "bg-primary/10 text-primary font-semibold"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
      )}
      aria-current={isActive ? "page" : undefined}
    >
      {label}
    </Link>
  );
}
