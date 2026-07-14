"use client";

/**
 * EditorDrawer — ED5 Task 8 (M6). The bespoke slide-over shell that used to
 * live inline in `TestModeDrawer` (a plain `<aside role="dialog">`, not a
 * shadcn `Sheet`/`Dialog` primitive), extracted so a SECOND drawer (the
 * read-only `LogicMapDrawer`) doesn't fork a second bespoke shell.
 * `TestModeDrawer` was refactored to use this — behavior-preserving (same
 * markup/classes, same close affordance).
 */
import * as React from "react";

export interface EditorDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function EditorDrawer({ open, onClose, title, children }: EditorDrawerProps) {
  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-label={title}
      className="fixed inset-y-0 right-0 z-50 w-[min(720px,100vw)] overflow-y-auto border-l bg-background p-6 shadow-xl"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="text-sm underline">
          Close
        </button>
      </div>
      {children}
    </aside>
  );
}
