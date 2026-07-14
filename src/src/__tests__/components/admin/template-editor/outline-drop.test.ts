import { resolveOutlineDrop } from "@/components/admin/template-editor/outline-drop";

const containers = { S1: ["a", "b"], S2: ["x"] };

describe("resolveOutlineDrop (ED5 T19, B-3)", () => {
  it("same-section drop → reorder", () => {
    expect(resolveOutlineDrop("a", "b", containers)).toEqual({
      kind: "reorder",
      sectionKey: "S1",
      order: ["b", "a"],
    });
  });

  it("cross-section drop onto a question → move at that question's index", () => {
    expect(resolveOutlineDrop("b", "x", containers)).toEqual({
      kind: "move",
      uid: "b",
      targetSectionKey: "S2",
      index: 0,
    });
  });

  it("drop onto an EMPTY section container → move to end (index 0)", () => {
    expect(resolveOutlineDrop("b", "S3", { ...containers, S3: [] })).toEqual({
      kind: "move",
      uid: "b",
      targetSectionKey: "S3",
      index: 0,
    });
  });

  it("drop onto a non-empty section container → move to the end index", () => {
    expect(resolveOutlineDrop("a", "S2", containers)).toEqual({
      kind: "move",
      uid: "a",
      targetSectionKey: "S2",
      index: 1,
    });
  });

  it("no-op when over === active", () => {
    expect(resolveOutlineDrop("a", "a", containers)).toBeNull();
  });

  it("no-op when the dragged id is unknown", () => {
    expect(resolveOutlineDrop("zzz", "b", containers)).toBeNull();
  });

  it("no-op when over is an unknown id", () => {
    expect(resolveOutlineDrop("a", "zzz", containers)).toBeNull();
  });

  it("reorders three within a section correctly", () => {
    const c = { S1: ["a", "b", "c"] };
    expect(resolveOutlineDrop("a", "c", c)).toEqual({
      kind: "reorder",
      sectionKey: "S1",
      order: ["b", "c", "a"],
    });
  });
});
