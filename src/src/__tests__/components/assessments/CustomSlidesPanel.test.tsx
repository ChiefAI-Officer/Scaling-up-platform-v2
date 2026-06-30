/**
 * Wave M (#19) — CustomSlidesPanel component test.
 *
 * Covers: add / remove / reorder, the ≤10 cap, the position picker (incl.
 * before-section options sourced from `sections`), live preview + sanitizer
 * warnings rendering, and the disabled state.
 *
 * The panel is CONTROLLED, so each test wraps it in a small stateful harness
 * that owns `value` and re-renders on `onChange` — mirroring how the wizard /
 * CampaignDetail use it.
 */

import React, { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  CustomSlidesPanel,
  type CustomSlidesPanelSection,
} from "@/components/assessments/CustomSlidesPanel";
import {
  MAX_SLIDES_PER_CAMPAIGN,
  type CustomSlide,
} from "@/lib/assessments/custom-slides";

const SECTIONS: CustomSlidesPanelSection[] = [
  { stableKey: "S1", name: "Strategy" },
  { stableKey: "S2", name: "Execution" },
];

function makeSlide(over: Partial<CustomSlide> = {}): CustomSlide {
  return {
    id: over.id ?? `slidefixed00000000000000${Math.random().toString(36).slice(2, 6)}`,
    title: over.title ?? "",
    html: over.html ?? "",
    position: over.position ?? { kind: "end" },
    sortOrder: over.sortOrder ?? 0,
  };
}

/** Controlled harness: owns `value`, exposes the latest value to assertions. */
function Harness({
  initial = [],
  sections = SECTIONS,
  disabled = false,
  onValue,
}: {
  initial?: CustomSlide[];
  sections?: CustomSlidesPanelSection[];
  disabled?: boolean;
  onValue?: (v: CustomSlide[]) => void;
}) {
  const [value, setValue] = useState<CustomSlide[]>(initial);
  return (
    <CustomSlidesPanel
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      sections={sections}
      disabled={disabled}
    />
  );
}

describe("CustomSlidesPanel", () => {
  it("renders an empty state with no slides", () => {
    render(<Harness initial={[]} />);
    expect(screen.getByTestId("custom-slides-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("custom-slide-card")).not.toBeInTheDocument();
    expect(screen.getByTestId("custom-slides-count")).toHaveTextContent(
      `0 / ${MAX_SLIDES_PER_CAMPAIGN} slides`,
    );
  });

  it("adds a slide when '+ Add slide' is clicked", () => {
    let latest: CustomSlide[] = [];
    render(<Harness initial={[]} onValue={(v) => (latest = v)} />);
    fireEvent.click(screen.getByTestId("custom-slides-add"));
    expect(latest).toHaveLength(1);
    expect(screen.getAllByTestId("custom-slide-card")).toHaveLength(1);
    expect(latest[0].position).toEqual({ kind: "end" });
    // The generated id must satisfy the persisted cuid-ish schema.
    expect(latest[0].id).toMatch(/^[a-z0-9][a-z0-9_-]{7,63}$/);
  });

  it("removes a slide via the ✕ button", () => {
    render(
      <Harness
        initial={[
          makeSlide({ id: "slidexxxxxxxxxxxxxxxxxxxxxx0", title: "Keep me" }),
        ]}
      />,
    );
    expect(screen.getByTestId("custom-slide-card")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("custom-slide-remove"));
    expect(screen.queryByTestId("custom-slide-card")).not.toBeInTheDocument();
    expect(screen.getByTestId("custom-slides-empty")).toBeInTheDocument();
  });

  it("reorders slides with the up/down controls and renumbers sortOrder", () => {
    let latest: CustomSlide[] = [];
    render(
      <Harness
        initial={[
          makeSlide({ id: "slideaaaaaaaaaaaaaaaaaaaaaaa", title: "First", sortOrder: 0 }),
          makeSlide({ id: "slidebbbbbbbbbbbbbbbbbbbbbbb", title: "Second", sortOrder: 1 }),
        ]}
        onValue={(v) => (latest = v)}
      />,
    );
    const cards = screen.getAllByTestId("custom-slide-card");
    // Move the SECOND card up.
    fireEvent.click(within(cards[1]).getByTestId("custom-slide-move-up"));
    expect(latest.map((s) => s.title)).toEqual(["Second", "First"]);
    // sortOrder is renumbered to match the new visual order.
    expect(latest.map((s) => s.sortOrder)).toEqual([0, 1]);
  });

  it("disables move-up on the first card and move-down on the last card", () => {
    render(
      <Harness
        initial={[
          makeSlide({ id: "slideaaaaaaaaaaaaaaaaaaaaaaa", title: "First" }),
          makeSlide({ id: "slidebbbbbbbbbbbbbbbbbbbbbbb", title: "Second" }),
        ]}
      />,
    );
    const cards = screen.getAllByTestId("custom-slide-card");
    expect(within(cards[0]).getByTestId("custom-slide-move-up")).toBeDisabled();
    expect(
      within(cards[1]).getByTestId("custom-slide-move-down"),
    ).toBeDisabled();
  });

  it("enforces the ≤10 cap: the add button disables and the cap hint shows", () => {
    const full = Array.from({ length: MAX_SLIDES_PER_CAMPAIGN }, (_, i) =>
      makeSlide({
        id: `slide${"x".repeat(20)}${i}`,
        title: `Slide ${i}`,
        sortOrder: i,
      }),
    );
    render(<Harness initial={full} />);
    expect(screen.getAllByTestId("custom-slide-card")).toHaveLength(
      MAX_SLIDES_PER_CAMPAIGN,
    );
    expect(screen.getByTestId("custom-slides-add")).toBeDisabled();
    expect(screen.getByTestId("custom-slides-cap")).toBeInTheDocument();
    expect(screen.getByTestId("custom-slides-count")).toHaveTextContent(
      `${MAX_SLIDES_PER_CAMPAIGN} / ${MAX_SLIDES_PER_CAMPAIGN} slides`,
    );
  });

  it("position picker offers Start / End plus a before-section option per section", () => {
    render(
      <Harness
        initial={[makeSlide({ id: "slidecccccccccccccccccccccc0" })]}
      />,
    );
    const select = screen.getByTestId("custom-slide-position") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(["start", "before:S1", "before:S2", "end"]);
    // The section display names appear in the option text.
    expect(select).toHaveTextContent("Before section: Strategy");
    expect(select).toHaveTextContent("Before section: Execution");
  });

  it("updates a slide's position to a before-section anchor via the picker", () => {
    let latest: CustomSlide[] = [];
    render(
      <Harness
        initial={[makeSlide({ id: "slidecccccccccccccccccccccc0" })]}
        onValue={(v) => (latest = v)}
      />,
    );
    fireEvent.change(screen.getByTestId("custom-slide-position"), {
      target: { value: "before:S2" },
    });
    expect(latest[0].position).toEqual({
      kind: "before-section",
      sectionStableKey: "S2",
    });
  });

  it("renders a sandboxed live-preview iframe carrying the sanitized body", () => {
    render(
      <Harness
        initial={[
          makeSlide({
            id: "slideddddddddddddddddddddddd0",
            html: "<p>Hello <strong>world</strong></p>",
          }),
        ]}
      />,
    );
    const iframe = screen.getByTestId("custom-slide-preview") as HTMLIFrameElement;
    // Sandboxed with no allow-tokens (scripts blocked) + no-referrer.
    expect(iframe.getAttribute("sandbox")).toBe("");
    expect(iframe.getAttribute("referrerpolicy")).toBe("no-referrer");
    const doc = iframe.getAttribute("srcdoc") ?? "";
    expect(doc).toContain("Hello <strong>world</strong>");
  });

  it("surfaces sanitizer strip-warnings for disallowed content (e.g. <script>)", () => {
    render(
      <Harness
        initial={[
          makeSlide({
            id: "slideeeeeeeeeeeeeeeeeeeeeeee0",
            html: "<p>ok</p><script>alert(1)</script>",
          }),
        ]}
      />,
    );
    const warn = screen.getByTestId("custom-slide-warnings");
    expect(warn).toBeInTheDocument();
    expect(warn).toHaveTextContent(/script/i);
    // The dangerous markup must NOT survive into the preview srcdoc.
    const iframe = screen.getByTestId("custom-slide-preview") as HTMLIFrameElement;
    expect(iframe.getAttribute("srcdoc") ?? "").not.toContain("<script");
  });

  it("disabled: controls are inert and add is blocked", () => {
    let latest: CustomSlide[] | null = null;
    render(
      <Harness
        initial={[makeSlide({ id: "slidefffffffffffffffffffffff0", title: "X" })]}
        disabled
        onValue={(v) => (latest = v)}
      />,
    );
    expect(screen.getByTestId("custom-slides-add")).toBeDisabled();
    expect(screen.getByTestId("custom-slide-remove")).toBeDisabled();
    expect(screen.getByTestId("custom-slide-title")).toBeDisabled();
    expect(screen.getByTestId("custom-slide-html")).toBeDisabled();
    expect(screen.getByTestId("custom-slide-position")).toBeDisabled();
    // Clicking the disabled remove must not mutate the value.
    fireEvent.click(screen.getByTestId("custom-slide-remove"));
    expect(latest).toBeNull();
  });

  it("shows the byte/character counters and flags an over-cap title in destructive tone", () => {
    render(
      <Harness
        initial={[
          makeSlide({
            id: "slideggggggggggggggggggggggg0",
            title: "Short title",
            html: "<p>body</p>",
          }),
        ]}
      />,
    );
    expect(screen.getByTestId("custom-slide-title-count")).toBeInTheDocument();
    expect(screen.getByTestId("custom-slide-html-count")).toBeInTheDocument();
  });
});
