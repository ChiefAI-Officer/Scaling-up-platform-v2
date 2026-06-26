"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isNavLinkActive } from "@/lib/nav-utils";
import {
  ADMIN_NAV,
  groupLeaves,
  type BadgeCounts,
  type BadgeKey,
  type NavGroup,
  type NavLink as NavLinkEntry,
} from "@/lib/nav/admin-nav-model";

const BADGE_NOUN: Record<BadgeKey, string> = {
  approvals: "pending approvals",
  refunds: "refunds needing action",
};

const itemBase =
  "inline-flex items-center px-2 py-2 rounded-md text-sm font-medium transition-colors duration-200 whitespace-nowrap cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

function CountBadge({ badge, counts }: { badge: BadgeKey; counts: BadgeCounts }) {
  const count = counts[badge];
  if (!count || count <= 0) return null;
  return (
    <span
      className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-none text-destructive-foreground tabular-nums"
      aria-label={`${count} ${BADGE_NOUN[badge]}`}
    >
      {count}
    </span>
  );
}

function TopLink({ entry, counts }: { entry: NavLinkEntry; counts: BadgeCounts }) {
  const pathname = usePathname();
  const isActive = isNavLinkActive(pathname, entry.href);
  return (
    <Link
      href={entry.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        itemBase,
        isActive
          ? "bg-primary/10 text-primary font-semibold"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
      )}
    >
      {entry.label}
      {entry.gateway ? (
        <span aria-hidden className="ml-1 opacity-70">
          →
        </span>
      ) : null}
      {entry.badge ? <CountBadge badge={entry.badge} counts={counts} /> : null}
    </Link>
  );
}

function GroupMenu({
  group,
  counts,
  isOpen,
  onOpen,
  onClose,
}: {
  group: NavGroup;
  counts: BadgeCounts;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const isActive = groupLeaves(group).some((leaf) => isNavLinkActive(pathname, leaf.href));

  // Progressive enhancement: focus the first link when the panel opens.
  useEffect(() => {
    if (isOpen) panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
  }, [isOpen]);

  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      onClose();
      triggerRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const links = Array.from(panelRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    if (links.length === 0) return;
    const idx = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next =
      e.key === "ArrowDown"
        ? links[(idx + 1) % links.length]
        : links[(idx - 1 + links.length) % links.length];
    next.focus();
  }

  // Active state takes precedence over the open/hover treatment so an active
  // group reads as "active" (primary tint), never merely "open".
  const triggerTone = isActive
    ? "bg-primary/10 text-primary font-semibold"
    : isOpen
      ? "bg-accent text-foreground font-semibold"
      : "text-muted-foreground hover:text-foreground hover:bg-accent/60";

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => (isOpen ? onClose() : onOpen())}
        className={cn(itemBase, "gap-1.5", triggerTone)}
      >
        {group.label}
        {!isOpen && group.badge ? <CountBadge badge={group.badge} counts={counts} /> : null}
        <span aria-hidden className="text-[10px] opacity-70">
          ▾
        </span>
      </button>

      {isOpen ? (
        <div
          id={menuId}
          ref={panelRef}
          role="group"
          aria-label={group.label}
          onKeyDown={onPanelKeyDown}
          className="absolute left-0 top-full z-50 mt-2 min-w-[224px] rounded-md border bg-card p-1.5 shadow-lg"
        >
          {group.sections.map((section, si) => (
            <div key={si}>
              {section.heading ? (
                <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.heading}
                </div>
              ) : null}
              {section.items.map((leaf) => {
                const leafActive = isNavLinkActive(pathname, leaf.href);
                return (
                  <Link
                    key={leaf.href}
                    href={leaf.href}
                    aria-current={leafActive ? "page" : undefined}
                    onClick={onClose}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-sm px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset",
                      leafActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground hover:bg-accent"
                    )}
                  >
                    <span>{leaf.label}</span>
                    {leaf.badge ? <CountBadge badge={leaf.badge} counts={counts} /> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AdminNavLinks({ counts }: { counts: BadgeCounts }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Close the open group on click outside the nav, on focus leaving the nav
  // (keyboard Tab-away), or on Escape anywhere. A single openGroup guarantees
  // only one panel is open at a time — keyboard activation (which fires click,
  // not mousedown) can never leave two panels open.
  useEffect(() => {
    if (!openGroup) return;
    const close = () => setOpenGroup(null);
    function onPointer(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) close();
    }
    function onFocusOut(e: FocusEvent) {
      if (navRef.current && !navRef.current.contains(e.relatedTarget as Node | null)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    const node = navRef.current;
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    node?.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      node?.removeEventListener("focusout", onFocusOut);
    };
  }, [openGroup]);

  return (
    <div ref={navRef} className="hidden xl:ml-6 xl:flex xl:items-center xl:space-x-0.5">
      {ADMIN_NAV.map((entry) =>
        entry.kind === "link" ? (
          <TopLink key={entry.href} entry={entry} counts={counts} />
        ) : (
          <GroupMenu
            key={entry.label}
            group={entry}
            counts={counts}
            isOpen={openGroup === entry.label}
            onOpen={() => setOpenGroup(entry.label)}
            onClose={() => setOpenGroup(null)}
          />
        )
      )}
    </div>
  );
}
