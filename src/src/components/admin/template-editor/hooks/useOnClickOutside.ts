"use client";

/**
 * useOnClickOutside — shared dismissal for the ED9 disclosure popovers
 * (T12 review fix).
 *
 * `QuestionTypePicker`'s type menu and `FormSectionCard`'s ⋯ menu are both
 * plain local `open`/`menuOpen` booleans that only close from their own
 * trigger — clicking elsewhere on the page, or pressing Escape, left them
 * open. This hook is the one shared implementation both wire in: it attaches
 * a capture-phase-free `mousedown` listener that calls `handler` when the
 * event target is outside `ref.current`, and a `keydown` listener that calls
 * `handler` on `Escape` regardless of focus target (so Escape closes the menu
 * even when focus never entered the popover).
 *
 * `handler` is read through a ref so a new function identity on every render
 * (e.g. an inline `() => setOpen(false)`) never re-subscribes the
 * document-level listeners — only `ref` (the popover container) and the
 * `enabled` flag participate in the effect's dependency array.
 */
import { useEffect, useRef } from "react";

export function useOnClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  handler: () => void,
  enabled: boolean = true,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (ref.current && target && !ref.current.contains(target)) {
        handlerRef.current();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        handlerRef.current();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [ref, enabled]);
}
