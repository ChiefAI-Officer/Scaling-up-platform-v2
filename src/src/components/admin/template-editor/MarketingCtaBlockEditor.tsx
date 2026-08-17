"use client";

import { useState } from "react";
import type {
  LinkTarget,
  MarketingCtaBlock,
} from "@/lib/assessments/marketing-cta";

function destinationValue(target: LinkTarget): string {
  if (target.kind === "url") return target.href;
  if (target.kind === "mailto") return target.address;
  if (target.kind === "tel") return target.number;
  return "";
}

function updateDestination(
  current: LinkTarget,
  kind: LinkTarget["kind"],
): LinkTarget {
  if (kind === "referringCoachOrDirectory") return { kind };
  const value = destinationValue(current);
  if (kind === "url") return { kind, href: value || "https://" };
  if (kind === "mailto") return { kind, address: value };
  return { kind, number: value };
}

export function MarketingCtaBlockEditor({
  block,
  index,
  total,
  onChange,
  onMove,
  onRemove,
  templateId,
}: {
  block: MarketingCtaBlock;
  index: number;
  total: number;
  onChange: (next: MarketingCtaBlock) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  templateId: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadImage = async (file: File) => {
    if (block.type !== "image") return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.set("templateId", templateId);
      form.set("file", file);
      const response = await fetch("/api/admin/assessment-cta-assets", {
        method: "POST",
        body: form,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.url !== "string") {
        throw new Error(
          typeof body.error === "string" ? body.error : "Upload failed",
        );
      }
      onChange({ ...block, src: body.url });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };
  return (
    <article className="rounded-xl border border-border bg-background p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm text-foreground">
          {block.type === "text"
            ? "Text"
            : block.type === "image"
              ? "Image"
              : block.type === "button"
                ? "Button"
                : "Divider"}
        </strong>
        <div className="flex gap-2">
          <button type="button" className="wf-btn" disabled={index === 0} onClick={() => onMove(-1)}>
            Move up
          </button>
          <button type="button" className="wf-btn" disabled={index === total - 1} onClick={() => onMove(1)}>
            Move down
          </button>
          <button type="button" className="wf-btn" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      {block.type === "text" && (
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            Heading or lead
            <input className="wf-input" value={block.lead} onChange={(event) => onChange({ ...block, lead: event.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            Body
            <textarea className="wf-textarea" value={block.body} onChange={(event) => onChange({ ...block, body: event.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            Alignment
            <select className="wf-select" value={block.align} onChange={(event) => onChange({ ...block, align: event.target.value as "left" | "center" })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
            </select>
          </label>
        </div>
      )}

      {block.type === "image" && (
        <div className="grid gap-3">
          {block.src && <img src={block.src} alt={block.alt} className="mx-auto max-h-48 max-w-full object-contain" />}
          <label className="grid gap-1 text-sm">
            Image URL
            <input className="wf-input" value={block.src} onChange={(event) => onChange({ ...block, src: event.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            Upload image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage(file);
              }}
            />
            {uploading && <span>Uploading…</span>}
            {uploadError && <span role="alert" className="text-destructive">{uploadError}</span>}
          </label>
          <label className="grid gap-1 text-sm">
            Alternative text
            <input className="wf-input" value={block.alt} onChange={(event) => onChange({ ...block, alt: event.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            Width
            <select className="wf-select" value={block.width} onChange={(event) => onChange({ ...block, width: event.target.value as "small" | "medium" | "large" })}>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </label>
        </div>
      )}

      {block.type === "button" && (
        <div className="grid gap-3" data-testid="marketing-cta-button-block">
          <label className="grid gap-1 text-sm">
            Button text
            <input className="wf-input" value={block.label} onChange={(event) => onChange({ ...block, label: event.target.value })} />
          </label>
          <label className="grid gap-1 text-sm">
            Destination type
            <select className="wf-select" value={block.target.kind} onChange={(event) => onChange({ ...block, target: updateDestination(block.target, event.target.value as LinkTarget["kind"]) })}>
              <option value="url">Web page</option>
              <option value="mailto">Email address</option>
              <option value="tel">Phone number</option>
              <option value="referringCoachOrDirectory">Referring coach or coach directory</option>
            </select>
          </label>
          {block.target.kind !== "referringCoachOrDirectory" && (
            <label className="grid gap-1 text-sm">
              Destination
              <input
                className="wf-input"
                value={destinationValue(block.target)}
                onChange={(event) => {
                  const value = event.target.value;
                  const target: LinkTarget =
                    block.target.kind === "url"
                      ? { kind: "url", href: value }
                      : block.target.kind === "mailto"
                        ? { kind: "mailto", address: value }
                        : { kind: "tel", number: value };
                  onChange({ ...block, target });
                }}
              />
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={block.newTab} onChange={(event) => onChange({ ...block, newTab: event.target.checked })} />
            Open in a new tab
          </label>
          <label className="grid gap-1 text-sm">
            Button style
            <select className="wf-select" value={block.style} onChange={(event) => onChange({ ...block, style: event.target.value as "primary" | "secondary" })}>
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
            </select>
          </label>
        </div>
      )}
    </article>
  );
}
