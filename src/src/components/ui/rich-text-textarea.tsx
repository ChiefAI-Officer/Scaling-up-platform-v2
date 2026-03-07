"use client";

import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  insertRichTextLink,
  wrapRichTextSelection,
} from "@/lib/rich-text-formatting";

interface RichTextTextareaProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  rows?: number;
  readOnly?: boolean;
  maxLength?: number;
  className?: string;
  toolbarClassName?: string;
}

export function RichTextTextarea({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  rows = 4,
  readOnly = false,
  maxLength,
  className,
  toolbarClassName,
}: RichTextTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function applyEdit(nextValue: string, selectionStart: number, selectionEnd: number) {
    onChange(nextValue);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function withSelection(
    callback: (selectionStart: number, selectionEnd: number) => {
      value: string;
      selectionStart: number;
      selectionEnd: number;
    }
  ) {
    const el = textareaRef.current;
    if (!el || readOnly) {
      return;
    }

    const result = callback(el.selectionStart ?? 0, el.selectionEnd ?? 0);
    applyEdit(result.value, result.selectionStart, result.selectionEnd);
  }

  function insertLink() {
    if (readOnly) {
      return;
    }

    const url = window.prompt("Enter URL:");
    if (!url) {
      return;
    }

    withSelection((selectionStart, selectionEnd) =>
      insertRichTextLink({ value, selectionStart, selectionEnd, maxLength }, url)
    );
  }

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 rounded-t-md border border-b-0 border-border bg-muted px-2 py-1",
          readOnly && "opacity-60",
          toolbarClassName
        )}
      >
        <button
          type="button"
          onClick={() =>
            withSelection((selectionStart, selectionEnd) =>
              wrapRichTextSelection(
                { value, selectionStart, selectionEnd, maxLength },
                "**",
                "**",
                "bold text"
              )
            )
          }
          className="rounded px-1.5 py-0.5 text-xs font-bold hover:bg-accent disabled:cursor-not-allowed"
          disabled={readOnly}
          aria-label="Bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() =>
            withSelection((selectionStart, selectionEnd) =>
              wrapRichTextSelection(
                { value, selectionStart, selectionEnd, maxLength },
                "*",
                "*",
                "italic text"
              )
            )
          }
          className="rounded px-1.5 py-0.5 text-xs italic hover:bg-accent disabled:cursor-not-allowed"
          disabled={readOnly}
          aria-label="Italic"
        >
          I
        </button>
        <button
          type="button"
          onClick={insertLink}
          className="rounded px-1.5 py-0.5 text-xs hover:bg-accent disabled:cursor-not-allowed"
          disabled={readOnly}
          aria-label="Insert link"
        >
          Link
        </button>
        <button
          type="button"
          onClick={() =>
            withSelection((selectionStart, selectionEnd) =>
              wrapRichTextSelection(
                { value, selectionStart, selectionEnd, maxLength },
                "\n---\n",
                "",
                ""
              )
            )
          }
          className="rounded px-1.5 py-0.5 text-xs hover:bg-accent disabled:cursor-not-allowed"
          disabled={readOnly}
          aria-label="Insert divider"
        >
          —
        </button>
      </div>

      <Textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        readOnly={readOnly}
        className={cn("rounded-t-none", className)}
      />
    </div>
  );
}
