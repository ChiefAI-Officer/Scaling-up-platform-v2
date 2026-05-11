"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  emailType: string;
  initialSubject: string;
  initialBody: string;
  // null = no row yet; the helper falls back to hardcoded defaults.
  version: number | null;
}

export function TransactionalEmailEditor({
  emailType,
  initialSubject,
  initialBody,
  version,
}: Props) {
  const router = useRouter();
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  async function handleSave() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/transactional-emails/${emailType}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          ...(version !== null ? { version } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          setMessage({
            type: "error",
            text:
              "Another admin saved this template while you were editing. Reload the page to see the latest version.",
          });
        } else {
          setMessage({
            type: "error",
            text:
              typeof data?.error === "string"
                ? data.error
                : `Save failed (${res.status})`,
          });
        }
        setBusy(false);
        return;
      }
      setMessage({ type: "success", text: "Saved." });
      router.refresh();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Network error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="subject">
          Subject
        </label>
        <input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          maxLength={200}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="body">
          Body (HTML)
        </label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={18}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Raw HTML. Token values are HTML-escaped before insertion at send time.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {message && (
          <span
            className={`text-sm ${
              message.type === "success" ? "text-success" : "text-destructive"
            }`}
          >
            {message.text}
          </span>
        )}
        {version !== null && (
          <span className="ml-auto text-xs text-muted-foreground">v{version}</span>
        )}
      </div>
    </div>
  );
}
