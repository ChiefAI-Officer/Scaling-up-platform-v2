"use client";

import { MarketingCtaBlockEditor } from "@/components/admin/template-editor/MarketingCtaBlockEditor";
import {
  createMarketingCtaPreset,
  type MarketingCtaBlock,
  type MarketingCtaConfigV1,
  type MarketingCtaPresetOrigin,
} from "@/lib/assessments/marketing-cta";

const PRESETS: Array<{
  value: MarketingCtaPresetOrigin;
  title: string;
  description: string;
}> = [
  {
    value: "FULL_MARKETING",
    title: "Full Marketing",
    description: "Books artwork plus the 32-question assessment, coaching follow-up, and book links.",
  },
  {
    value: "SCALING_UP_QUICK",
    title: "Scaling Up Quick",
    description: "A lighter next step with Scaling Up resources and a coach connection.",
  },
  {
    value: "BLANK",
    title: "Start blank",
    description: "Build a different marketing treatment from structured blocks.",
  },
];

function newId(type: MarketingCtaBlock["type"]): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${type}-${id}`;
}

function newBlock(type: MarketingCtaBlock["type"]): MarketingCtaBlock {
  if (type === "text") return { id: newId(type), type, lead: "", body: "", align: "left" };
  if (type === "image") return { id: newId(type), type, src: "", alt: "", width: "medium" };
  if (type === "button") {
    return {
      id: newId(type),
      type,
      label: "New button",
      target: { kind: "url", href: "https://" },
      newTab: true,
      style: "primary",
    };
  }
  return { id: newId(type), type };
}

export function MarketingCtaEditor({
  templateId,
  value,
  onChange,
  onPreview,
  previewDisabled,
}: {
  templateId: string;
  value: MarketingCtaConfigV1 | null;
  onChange: (next: MarketingCtaConfigV1) => void;
  onPreview: () => void;
  previewDisabled: boolean;
}) {
  const selectPreset = (origin: MarketingCtaPresetOrigin) => {
    if (value && value.presetOrigin !== origin && value.blocks.length > 0) {
      const replace = window.confirm(
        "Replace this draft’s current Marketing CTA? Your unpublished CTA changes will be replaced.",
      );
      if (!replace) return;
    }
    onChange(createMarketingCtaPreset(origin));
  };
  const updateBlocks = (blocks: MarketingCtaBlock[]) => {
    if (!value) return;
    onChange({ ...value, blocks, sanitizedHtml: "" });
  };

  return (
    <section className="wf-card space-y-5 p-6" data-testid="marketing-cta-editor">
      <div>
        <h3 className="wf-card-title">Marketing call to action</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Appears after the on-screen results for new public campaigns using this published version.
        </p>
      </div>
      <fieldset>
        <legend className="wf-label">Choose a starting treatment</legend>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {PRESETS.map((preset) => (
            <label key={preset.value} className={`cursor-pointer rounded-xl border p-4 ${value?.presetOrigin === preset.value ? "border-primary bg-primary/5" : "border-border"}`}>
              <span className="flex gap-2">
                <input type="radio" name="marketing-cta-preset" checked={value?.presetOrigin === preset.value} onChange={() => selectPreset(preset.value)} />
                <span>
                  <strong className="block text-sm">{preset.title}</strong>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{preset.description}</span>
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {value && (
        <>
          <div className="space-y-3">
            {value.blocks.map((block, index) => (
              <MarketingCtaBlockEditor
                key={block.id}
                block={block}
                index={index}
                total={value.blocks.length}
                onChange={(next) => updateBlocks(value.blocks.map((current) => current.id === block.id ? next : current))}
                onMove={(direction) => {
                  const target = index + direction;
                  if (target < 0 || target >= value.blocks.length) return;
                  const blocks = [...value.blocks];
                  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
                  updateBlocks(blocks);
                }}
                onRemove={() => updateBlocks(value.blocks.filter((current) => current.id !== block.id))}
                templateId={templateId}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["text", "image", "button", "divider"] as const).map((type) => (
              <button key={type} type="button" className="wf-btn" onClick={() => updateBlocks([...value.blocks, newBlock(type)])}>
                Add {type}
              </button>
            ))}
          </div>
          <button type="button" className="wf-btn wf-btn-primary" disabled={previewDisabled} onClick={onPreview}>
            {previewDisabled ? "Save draft to preview" : "Preview public result"}
          </button>
        </>
      )}
    </section>
  );
}
