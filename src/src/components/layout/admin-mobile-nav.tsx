"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Menu, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavLinkActive } from "@/lib/nav-utils";
import {
  ADMIN_NAV,
  groupLeaves,
  type BadgeCounts,
  type BadgeKey,
  type NavGroup,
} from "@/lib/nav/admin-nav-model";

const BADGE_NOUN: Record<BadgeKey, string> = {
  approvals: "pending approvals",
  refunds: "refunds needing action",
};

function MobileBadge({ badge, counts }: { badge: BadgeKey; counts: BadgeCounts }) {
  const count = counts[badge];
  if (!count || count <= 0) return null;
  return (
    <span
      className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-none text-destructive-foreground tabular-nums"
      aria-label={`${count} ${BADGE_NOUN[badge]}`}
    >
      {count}
    </span>
  );
}

function MobileGroup({
  group,
  counts,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  counts: BadgeCounts;
  pathname: string;
  onNavigate: () => void;
}) {
  // Collapsed by default; auto-expanded when it contains the current route.
  const containsActive = groupLeaves(group).some((leaf) => isNavLinkActive(pathname, leaf.href));
  const [open, setOpen] = useState(containsActive);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span className="flex items-center">
          {group.label}
          {!open && group.badge ? <MobileBadge badge={group.badge} counts={counts} /> : null}
        </span>
        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 transition-transform", open ? "rotate-180" : "")}
        />
      </button>
      {open
        ? group.sections.flatMap((section) =>
            section.items.map((leaf) => {
              const active = isNavLinkActive(pathname, leaf.href);
              return (
                <Link
                  key={leaf.href}
                  href={leaf.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center justify-between rounded-lg py-2 pl-6 pr-3 text-sm font-medium",
                    active
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-foreground hover:bg-accent/60"
                  )}
                >
                  <span>{leaf.label}</span>
                  {leaf.badge ? <MobileBadge badge={leaf.badge} counts={counts} /> : null}
                </Link>
              );
            })
          )
        : null}
    </div>
  );
}

export function AdminMobileNav({ counts, email }: { counts: BadgeCounts; email: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  return (
    <div className="xl:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {open ? (
        <div className="absolute top-16 inset-x-0 bg-card border-b shadow-lg z-50">
          <div className="px-4 py-3 space-y-1 max-h-[calc(100vh-4rem)] overflow-y-auto">
            {ADMIN_NAV.map((entry) => {
              if (entry.kind === "link") {
                const active = isNavLinkActive(pathname, entry.href);
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium",
                      active
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-foreground hover:bg-accent/60"
                    )}
                  >
                    <span>
                      {entry.label}
                      {entry.gateway ? (
                        <span aria-hidden className="ml-1 opacity-70">
                          →
                        </span>
                      ) : null}
                    </span>
                    {entry.badge ? <MobileBadge badge={entry.badge} counts={counts} /> : null}
                  </Link>
                );
              }
              return (
                <MobileGroup
                  key={entry.label}
                  group={entry}
                  counts={counts}
                  pathname={pathname}
                  onNavigate={close}
                />
              );
            })}

            <div className="border-t pt-2 mt-2 space-y-1">
              <p className="px-3 py-1 text-xs text-muted-foreground">{email}</p>
              <Link
                href="/admin/settings"
                onClick={close}
                className="block px-3 py-2 rounded-lg text-foreground hover:bg-accent text-sm font-medium"
              >
                Settings
              </Link>
              <button
                onClick={() => {
                  close();
                  void signOut({ callbackUrl: "/login" });
                }}
                className="block w-full text-left px-3 py-2 rounded-lg text-destructive hover:bg-destructive/10 text-sm font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
