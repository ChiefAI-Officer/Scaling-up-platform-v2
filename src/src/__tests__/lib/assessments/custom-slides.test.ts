import {
  CustomSlideSchema,
  CustomSlidesArraySchema,
  mergeCustomSlides,
  MAX_SLIDES_PER_CAMPAIGN,
  MAX_SLIDE_TITLE_LENGTH,
  MAX_SLIDE_HTML_BYTES,
  type SafeSlide,
} from "@/lib/assessments/custom-slides";
import type { SectionPage } from "@/lib/assessments/section-pages";
import { OTHER_PAGE_KEY } from "@/lib/assessments/section-pages";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const validId = "ckslide0000000abc"; // cuid-ish (lowercase alphanumeric, >=8 chars)

function makeSlide(over: Partial<CustomSlideInput> = {}): CustomSlideInput {
  return {
    id: validId,
    title: "A slide",
    html: "<p>hello</p>",
    position: { kind: "start" },
    sortOrder: 0,
    ...over,
  };
}

type CustomSlideInput = {
  id: string;
  title?: string;
  html: string;
  position: { kind: "start" } | { kind: "before-section"; sectionStableKey: string } | { kind: "end" };
  sortOrder: number;
};

function sectionPage(stableKey: string, name = stableKey): SectionPage {
  return { stableKey, name, isOther: false, questions: [] };
}

function otherPage(): SectionPage {
  return { stableKey: OTHER_PAGE_KEY, name: "Other", isOther: true, questions: [] };
}

function safe(over: Partial<SafeSlide> = {}): SafeSlide {
  return {
    id: validId,
    title: "A slide",
    safeHtml: "<p>hello</p>",
    position: { kind: "start" },
    sortOrder: 0,
    ...over,
  };
}

/** Read the discriminant + identity of merged pages for compact assertions. */
function shape(pages: ReturnType<typeof mergeCustomSlides>["pages"]): string[] {
  return pages.map((p) => (p.kind === "section" ? `S:${p.stableKey}` : `slide:${p.id}`));
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema — accept
// ─────────────────────────────────────────────────────────────────────────────

describe("CustomSlideSchema — accept", () => {
  it("accepts a minimal valid slide", () => {
    expect(CustomSlideSchema.safeParse(makeSlide()).success).toBe(true);
  });

  it("accepts each position kind", () => {
    expect(CustomSlideSchema.safeParse(makeSlide({ position: { kind: "start" } })).success).toBe(true);
    expect(CustomSlideSchema.safeParse(makeSlide({ position: { kind: "end" } })).success).toBe(true);
    expect(
      CustomSlideSchema.safeParse(
        makeSlide({ position: { kind: "before-section", sectionStableKey: "sec1" } }),
      ).success,
    ).toBe(true);
  });

  it("accepts a missing (optional) title", () => {
    const noTitle: Omit<CustomSlideInput, "title"> & { title?: string } = makeSlide();
    delete noTitle.title;
    expect(CustomSlideSchema.safeParse(noTitle).success).toBe(true);
  });

  it("accepts a title exactly at the cap", () => {
    expect(CustomSlideSchema.safeParse(makeSlide({ title: "x".repeat(MAX_SLIDE_TITLE_LENGTH) })).success).toBe(true);
  });

  it("accepts html exactly at the byte cap", () => {
    expect(CustomSlideSchema.safeParse(makeSlide({ html: "a".repeat(MAX_SLIDE_HTML_BYTES) })).success).toBe(true);
  });

  it("accepts an array of up to 10 slides", () => {
    const arr = Array.from({ length: MAX_SLIDES_PER_CAMPAIGN }, (_v, i) =>
      makeSlide({ id: `ckslide${String(i).padStart(8, "0")}`, sortOrder: i }),
    );
    expect(CustomSlidesArraySchema.safeParse(arr).success).toBe(true);
  });

  it("accepts an empty array", () => {
    expect(CustomSlidesArraySchema.safeParse([]).success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema — reject (caps + bad shapes)
// ─────────────────────────────────────────────────────────────────────────────

describe("CustomSlideSchema — reject", () => {
  it("rejects an array of 11 slides (>10 cap)", () => {
    const arr = Array.from({ length: MAX_SLIDES_PER_CAMPAIGN + 1 }, (_v, i) =>
      makeSlide({ id: `ckslide${String(i).padStart(8, "0")}`, sortOrder: i }),
    );
    expect(CustomSlidesArraySchema.safeParse(arr).success).toBe(false);
  });

  it("rejects html over 20 KB (21 KB)", () => {
    const oversized = "a".repeat(21 * 1024); // 21504 bytes > 20480
    expect(CustomSlideSchema.safeParse(makeSlide({ html: oversized })).success).toBe(false);
  });

  it("rejects a title over the length cap", () => {
    expect(CustomSlideSchema.safeParse(makeSlide({ title: "x".repeat(MAX_SLIDE_TITLE_LENGTH + 1) })).success).toBe(false);
  });

  it("rejects a bad position kind", () => {
    const bad = { ...makeSlide(), position: { kind: "middle" } };
    expect(CustomSlideSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects before-section with an empty sectionStableKey", () => {
    expect(
      CustomSlideSchema.safeParse(makeSlide({ position: { kind: "before-section", sectionStableKey: "" } })).success,
    ).toBe(false);
  });

  it("rejects a non-cuid-ish id", () => {
    expect(CustomSlideSchema.safeParse(makeSlide({ id: "" })).success).toBe(false);
    expect(CustomSlideSchema.safeParse(makeSlide({ id: "no" })).success).toBe(false); // too short
    expect(CustomSlideSchema.safeParse(makeSlide({ id: "Has Spaces!!" })).success).toBe(false);
  });

  it("rejects a non-integer sortOrder", () => {
    expect(CustomSlideSchema.safeParse(makeSlide({ sortOrder: 1.5 })).success).toBe(false);
  });

  it("rejects a non-string html", () => {
    const bad = { ...makeSlide(), html: 123 };
    expect(CustomSlideSchema.safeParse(bad).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mergeCustomSlides — pure merge
// ─────────────────────────────────────────────────────────────────────────────

describe("mergeCustomSlides", () => {
  it("empty slides array is a no-op (sections wrapped, order unchanged)", () => {
    const sections = [sectionPage("a"), sectionPage("b")];
    const { pages, droppedSlideIds } = mergeCustomSlides(sections, []);
    expect(shape(pages)).toEqual(["S:a", "S:b"]);
    expect(droppedSlideIds).toEqual([]);
    expect(pages.every((p) => p.kind === "section")).toBe(true);
  });

  it("wraps each SectionPage carrying its fields through", () => {
    const sections = [sectionPage("a", "Alpha")];
    const { pages } = mergeCustomSlides(sections, []);
    const p0 = pages[0];
    expect(p0.kind).toBe("section");
    if (p0.kind === "section") {
      expect(p0.stableKey).toBe("a");
      expect(p0.name).toBe("Alpha");
      expect(p0.isOther).toBe(false);
    }
  });

  it("inserts a `start` slide before the first section", () => {
    const sections = [sectionPage("a"), sectionPage("b")];
    const { pages } = mergeCustomSlides(sections, [safe({ id: "slideStart", position: { kind: "start" } })]);
    expect(shape(pages)).toEqual(["slide:slideStart", "S:a", "S:b"]);
  });

  it("inserts a `before-section` slide immediately before the matching section", () => {
    const sections = [sectionPage("a"), sectionPage("b")];
    const { pages } = mergeCustomSlides(sections, [
      safe({ id: "beforeB", position: { kind: "before-section", sectionStableKey: "b" } }),
    ]);
    expect(shape(pages)).toEqual(["S:a", "slide:beforeB", "S:b"]);
  });

  it("inserts an `end` slide at the tail (after the last section)", () => {
    const sections = [sectionPage("a"), sectionPage("b")];
    const { pages } = mergeCustomSlides(sections, [safe({ id: "endSlide", position: { kind: "end" } })]);
    expect(shape(pages)).toEqual(["S:a", "S:b", "slide:endSlide"]);
  });

  it("orders multiple slides at the same anchor by sortOrder", () => {
    const sections = [sectionPage("a")];
    const slides = [
      safe({ id: "start3", position: { kind: "start" }, sortOrder: 3 }),
      safe({ id: "start1", position: { kind: "start" }, sortOrder: 1 }),
      safe({ id: "start2", position: { kind: "start" }, sortOrder: 2 }),
    ];
    const { pages } = mergeCustomSlides(sections, slides);
    expect(shape(pages)).toEqual(["slide:start1", "slide:start2", "slide:start3", "S:a"]);
  });

  it("places `end` slides AFTER the orphan 'Other' page (Other stays last QUESTION page)", () => {
    const sections = [sectionPage("a"), otherPage()];
    const { pages } = mergeCustomSlides(sections, [safe({ id: "endSlide", position: { kind: "end" } })]);
    expect(shape(pages)).toEqual(["S:a", `S:${OTHER_PAGE_KEY}`, "slide:endSlide"]);
    // The Other page is the last page that is a section page (no slide between it and the question pages above).
    const otherIdx = pages.findIndex((p) => p.kind === "section" && p.stableKey === OTHER_PAGE_KEY);
    const endIdx = pages.findIndex((p) => p.kind === "slide" && p.id === "endSlide");
    expect(otherIdx).toBeLessThan(endIdx);
    expect(otherIdx).toBe(pages.length - 2);
  });

  it("never anchors a `before-section` slide onto the 'Other' orphan page", () => {
    const sections = [sectionPage("a"), otherPage()];
    // anchor explicitly to the Other key — must be treated as unknown ⇒ dropped
    const { pages, droppedSlideIds } = mergeCustomSlides(sections, [
      safe({ id: "ghost", position: { kind: "before-section", sectionStableKey: OTHER_PAGE_KEY } }),
    ]);
    expect(droppedSlideIds).toEqual(["ghost"]);
    expect(shape(pages)).toEqual(["S:a", `S:${OTHER_PAGE_KEY}`]);
  });

  it("drops a slide whose `before-section` anchor matches no section, and surfaces its id", () => {
    const sections = [sectionPage("a")];
    const { pages, droppedSlideIds } = mergeCustomSlides(sections, [
      safe({ id: "orphanSlide", position: { kind: "before-section", sectionStableKey: "nope" } }),
    ]);
    expect(shape(pages)).toEqual(["S:a"]);
    expect(droppedSlideIds).toEqual(["orphanSlide"]);
  });

  it("skips an empty slide (no title AND empty safeHtml) without counting it as dropped", () => {
    const sections = [sectionPage("a")];
    const { pages, droppedSlideIds } = mergeCustomSlides(sections, [
      safe({ id: "blank", title: undefined, safeHtml: "   ", position: { kind: "start" } }),
    ]);
    expect(shape(pages)).toEqual(["S:a"]);
    expect(droppedSlideIds).toEqual([]);
  });

  it("keeps a slide that has a title even when its safeHtml is empty", () => {
    const sections = [sectionPage("a")];
    const { pages } = mergeCustomSlides(sections, [
      safe({ id: "titleOnly", title: "Just a heading", safeHtml: "", position: { kind: "start" } }),
    ]);
    expect(shape(pages)).toEqual(["slide:titleOnly", "S:a"]);
  });

  it("combines start / before-section / end slides in one merge", () => {
    const sections = [sectionPage("a"), sectionPage("b"), otherPage()];
    const slides = [
      safe({ id: "s", position: { kind: "start" }, sortOrder: 0 }),
      safe({ id: "beforeB", position: { kind: "before-section", sectionStableKey: "b" }, sortOrder: 0 }),
      safe({ id: "e", position: { kind: "end" }, sortOrder: 0 }),
      safe({ id: "drop", position: { kind: "before-section", sectionStableKey: "ghost" }, sortOrder: 0 }),
    ];
    const { pages, droppedSlideIds } = mergeCustomSlides(sections, slides);
    expect(shape(pages)).toEqual(["slide:s", "S:a", "slide:beforeB", "S:b", `S:${OTHER_PAGE_KEY}`, "slide:e"]);
    expect(droppedSlideIds).toEqual(["drop"]);
  });

  it("does not mutate its inputs", () => {
    const sections = [sectionPage("a")];
    const slides = [safe({ id: "x", position: { kind: "start" } })];
    const sectionsCopy = JSON.parse(JSON.stringify(sections));
    const slidesCopy = JSON.parse(JSON.stringify(slides));
    mergeCustomSlides(sections, slides);
    expect(sections).toEqual(sectionsCopy);
    expect(slides).toEqual(slidesCopy);
  });

  it("emits the slide page with already-sanitized safeHtml (no re-sanitization)", () => {
    const sections = [sectionPage("a")];
    const { pages } = mergeCustomSlides(sections, [
      safe({ id: "x", title: "Promo", safeHtml: "<p>trusted</p>", position: { kind: "start" } }),
    ]);
    const slide = pages[0];
    expect(slide.kind).toBe("slide");
    if (slide.kind === "slide") {
      expect(slide.id).toBe("x");
      expect(slide.title).toBe("Promo");
      expect(slide.safeHtml).toBe("<p>trusted</p>");
    }
  });
});
