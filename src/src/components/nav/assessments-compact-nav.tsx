"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AssessmentsNavEntry {
  href: string;
  label: string;
  exact?: boolean;
  placeholder?: boolean;
}

interface AssessmentsCompactNavProps {
  entries: AssessmentsNavEntry[];
}

function currentEntry(
  entries: AssessmentsNavEntry[],
  pathname: string,
): AssessmentsNavEntry | undefined {
  return entries
    .filter((entry) => {
      if (entry.placeholder) return false;
      if (entry.exact) return pathname === entry.href;
      return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
    })
    .sort((left, right) => right.href.length - left.href.length)[0];
}

export function AssessmentsCompactNav({
  entries,
}: AssessmentsCompactNavProps) {
  const pathname = usePathname();

  if (entries.length === 0) return null;

  return (
    <AssessmentsCompactDisclosure
      key={pathname}
      entries={entries}
      pathname={pathname}
    />
  );
}

function AssessmentsCompactDisclosure({
  entries,
  pathname,
}: AssessmentsCompactNavProps & { pathname: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeEntry = currentEntry(entries, pathname);
  const currentLabel = activeEntry?.label ?? entries[0]?.label ?? "Assessments";

  useEffect(() => {
    if (!open) return;
    const dismiss = () => {
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) dismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div className="border-b border-border bg-card/40 p-3 sm:hidden" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-left text-sm font-semibold text-foreground"
        aria-expanded={open}
        aria-controls="assessments-compact-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        <span>Assessment section: {currentLabel}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <nav
          id="assessments-compact-navigation"
          aria-label="Compact assessments navigation"
          className="mt-2 space-y-1"
        >
          {entries.map((entry) => {
            const active = activeEntry?.href === entry.href;
            return (
              <Link
                key={entry.href + entry.label}
                href={entry.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                aria-disabled={entry.placeholder || undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-md px-3 py-2 text-sm transition-colors duration-150",
                  active
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  entry.placeholder && "opacity-60",
                )}
              >
                {entry.label}
                {entry.placeholder ? (
                  <span className="ml-2 text-xs italic text-muted-foreground/70">
                    (coming soon)
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
