import type { PagerPage } from "@/lib/assessments/custom-slides";
import type { PagerQuestion } from "@/lib/assessments/section-pages";
import {
  buildQuestionRenderUnits,
  initialVisibleStoryCount,
  questionProgress,
} from "@/lib/assessments/qsp-story-group";

const prompt =
  "Which employees have demonstrated that they live the core values? Why? Share the stories.";

function story(index: 1 | 2 | 3, over: Partial<PagerQuestion> = {}): PagerQuestion {
  return {
    stableKey: `P1_core_values_story_${index}`,
    sortOrder: 8 + index,
    sectionStableKey: "P1_retrospective",
    type: "TEXT",
    label: `${prompt} (Story ${index} of 3)`,
    isRequired: false,
    ...over,
  };
}

const triplet = [story(1), story(2), story(3)];

it("groups only the exact enabled qsp-v2 triplet", () => {
  const units = buildQuestionRenderUnits(triplet, {
    enabled: true,
    templateAlias: "qsp-v2",
  });
  expect(units).toHaveLength(1);
  expect(units[0]).toMatchObject({ kind: "qsp-story-group", prompt });
});

it.each([
  ["flag off", { enabled: false, templateAlias: "qsp-v2" }, triplet],
  ["wrong alias", { enabled: true, templateAlias: "other" }, triplet],
  ["missing key", { enabled: true, templateAlias: "qsp-v2" }, triplet.slice(0, 2)],
  ["wrong order", { enabled: true, templateAlias: "qsp-v2" }, [story(2), story(1), story(3)]],
  ["wrong type", { enabled: true, templateAlias: "qsp-v2" }, [story(1), story(2, { type: "NUMBER" }), story(3)]],
  ["required slot", { enabled: true, templateAlias: "qsp-v2" }, [story(1), story(2, { isRequired: true }), story(3)]],
  ["different section", { enabled: true, templateAlias: "qsp-v2" }, [story(1), story(2), story(3, { sectionStableKey: "P2" })]],
])("falls back for %s", (_name, options, questions) => {
  expect(buildQuestionRenderUnits(questions, options)).toHaveLength(questions.length);
  expect(buildQuestionRenderUnits(questions, options).every((unit) => unit.kind === "question")).toBe(true);
});

it("expands restored work through the highest nonblank slot", () => {
  const group = buildQuestionRenderUnits(triplet, {
    enabled: true,
    templateAlias: "qsp-v2",
  })[0];
  if (group.kind !== "qsp-story-group") throw new Error("expected grouped unit");
  expect(initialVisibleStoryCount(group.questions, {})).toBe(1);
  expect(initialVisibleStoryCount(group.questions, { P1_core_values_story_2: "Ada led the launch" })).toBe(2);
  expect(initialVisibleStoryCount(group.questions, { P1_core_values_story_3: "Grace coached the team" })).toBe(3);
  expect(initialVisibleStoryCount(group.questions, { P1_core_values_story_3: "   " })).toBe(1);
});

it("counts the group as one logical item answered by any nonblank slot", () => {
  const pages: PagerPage[] = [{
    kind: "section",
    stableKey: "P1_retrospective",
    name: "Looking back",
    isOther: false,
    questions: triplet,
  }];
  expect(questionProgress(pages, {}, { enabled: true, templateAlias: "qsp-v2" }))
    .toEqual({ answered: 0, total: 1 });
  expect(questionProgress(
    pages,
    { P1_core_values_story_2: "Ada led the launch" },
    { enabled: true, templateAlias: "qsp-v2" },
  )).toEqual({ answered: 1, total: 1 });
  expect(questionProgress(pages, {}, { enabled: false, templateAlias: "qsp-v2" }))
    .toEqual({ answered: 0, total: 3 });
});
