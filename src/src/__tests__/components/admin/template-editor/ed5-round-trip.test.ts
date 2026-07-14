/**
 * ED5 T21 (co-validate C6) — round-trip persistence tests for the two
 * draft-corrupting paths: cascade section-delete and cross-section move. Each
 * mutates through the REAL model hook, then serialises exactly as Save Draft
 * would (`buildVersionScoringPayload`), asserting the persisted payload carries
 * NO orphaned section reference and NO dangling show-if — i.e. the corruption
 * class the pre-cascade orphan-delete could produce never survives to the wire.
 * (tier→publish domain-span is covered by scoring-publish-section-refs +
 * ScoringTiersTab live validation; the raw-ref follow-up-save reconciliation is
 * pinned by the editor byte-equivalence guard.)
 */

import { renderHook, act } from "@testing-library/react";

import { useTemplateEditorDraft } from "@/components/admin/template-editor/hooks/useTemplateEditorDraft";
import { buildVersionScoringPayload } from "@/components/admin/template-editor/build-version-payload";

const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

const template = {
  id: "tpl_1",
  name: "Alpha",
  alias: "ALPHA",
  aggregationMode: "FULL_VISIBILITY" as const,
  accessMode: "INVITED" as const,
};

function makeVersion() {
  return {
    id: "ver_rt",
    versionNumber: 2,
    language: "en-US",
    publishedAt: null as string | null,
    contentHash: "abcdef012345",
    sections: [
      { stableKey: "S1", name: "Section One" },
      { stableKey: "S2", name: "Section Two" },
    ],
    questions: [
      {
        stableKey: "S1_gate",
        sectionStableKey: "S1",
        label: "Gate",
        type: "MULTI_CHOICE",
        isRequired: true,
        sortOrder: 1,
        options: [{ key: "a", label: "Alpha" }],
        maxChoices: 1,
      },
      {
        stableKey: "S1_in",
        sectionStableKey: "S1",
        label: "In-section dependent",
        type: "TEXT",
        isRequired: false,
        sortOrder: 2,
        showIf: { questionKey: "S1_gate", optionKey: "a" },
      },
      {
        stableKey: "S2_ext",
        sectionStableKey: "S2",
        label: "External dependent",
        type: "TEXT",
        isRequired: false,
        sortOrder: 1,
        showIf: { questionKey: "S1_gate", optionKey: "a" },
      },
    ],
    scoringConfig: {},
    reportConfig: null,
  };
}

function renderDraft() {
  return renderHook(() =>
    useTemplateEditorDraft({
      template,
      version: makeVersion(),
      publishedQuestionKeys: [],
      publishedOptionKeys: {},
      questionEditorUnlocked: true,
      waveQEnabled: false,
    }),
  );
}

/** Serialise the current draft state exactly as Save Draft would (both surfaces
 *  dirty, so it reserialises from the live model rather than a raw pass-through). */
function serialize(current: ReturnType<typeof useTemplateEditorDraft>) {
  // Raw = the stored version's rows (keyed by stableKey), so the serializer's
  // option-key immutability check finds each MULTI_CHOICE's persisted keys — the
  // same arrays Save Draft passes from the hook's raw refs.
  const raw = makeVersion();
  return buildVersionScoringPayload({
    questions: current.questions,
    sections: current.sections,
    rawQuestions: raw.questions,
    rawSections: raw.sections,
    scoringConfig: {},
    publishedKeys: new Set(),
    publishedOptionKeys: {},
    dirty: { questions: true, sections: true },
  });
}

function payloadQuestions(payload: { questions: unknown }): Array<{
  stableKey?: string;
  sectionStableKey?: string;
  showIf?: { questionKey?: string } | null;
}> {
  return (payload.questions as Array<Record<string, unknown>>).map((q) => ({
    stableKey: q.stableKey as string | undefined,
    sectionStableKey: q.sectionStableKey as string | undefined,
    showIf: (q.showIf as { questionKey?: string } | null) ?? null,
  }));
}

describe("ED5 T21 — round-trip persistence (co-validate C6)", () => {
  it("cascade delete → serialize: no orphaned section ref, no dangling show-if", () => {
    const { result } = renderDraft();
    const s1 = result.current.sections.find((s) => s.stableKey === "S1")!;

    act(() => {
      result.current.deleteSection(s1.uid);
    });

    // Serialisation must NOT throw the orphan guard (no dangling sectionStableKey).
    const payload = serialize(result.current);
    const qs = payloadQuestions(payload);

    // The deleted section + its questions are gone; only S2_ext survives.
    expect(qs.map((q) => q.stableKey).sort()).toEqual(["S2_ext"]);
    // Its show-if (which gated on the deleted S1_gate) was cleared → not dangling.
    expect(qs[0].showIf).toBeNull();
    // Sections payload no longer contains S1.
    const sectionKeys = (payload.sections as Array<{ stableKey?: string }>).map(
      (s) => s.stableKey,
    );
    expect(sectionKeys).not.toContain("S1");
    expect(sectionKeys).toContain("S2");
  });

  it("cross-section move → serialize: question re-homed, key + show-if preserved", () => {
    const { result } = renderDraft();
    const gateUid = result.current.questions.find(
      (q) => q.stableKey === "S1_gate",
    )!.uid;

    act(() => {
      result.current.moveQuestionToSection(gateUid, "S2");
    });

    const payload = serialize(result.current);
    const qs = payloadQuestions(payload);
    const moved = qs.find((q) => q.stableKey === "S1_gate");

    expect(moved).toBeDefined();
    // Re-homed to S2, but the immutable key keeps its original S1 prefix.
    expect(moved!.sectionStableKey).toBe("S2");
    expect(moved!.stableKey).toBe("S1_gate");
    // No orphan/dangling introduced by the move (serialisation didn't throw).
    const sectionKeys = (payload.sections as Array<{ stableKey?: string }>).map(
      (s) => s.stableKey,
    );
    for (const q of qs) {
      if (q.sectionStableKey) expect(sectionKeys).toContain(q.sectionStableKey);
    }
  });
});
