/**
 * ED10 Task 0 (Wave ED10 — Metadata→Preview + Settings tab rebuild) — golden
 * byte-identity net, captured at HEAD, BEFORE any ED10 code exists.
 *
 * ED10 will (behind `WAVE_ED10_PREVIEW_SETTINGS_ENABLED`, default OFF):
 *   - turn the editor's Metadata tab into a Preview tab + add a Settings tab
 *     (TabbedShell / MetadataTab churn), and
 *   - add an additive `previewMode` prop to the respondent `SectionPager`
 *     (default false ⇒ the live INVITED/PUBLIC survey byte-identical).
 *
 * These two snapshots pin the pre-ED10 DOM so every later ED10 task can PROVE
 * it left the flag-OFF paths byte-identical:
 *   (a) the forms-mode editor SHELL (ED9 live config: singleColumn +
 *       formsBuild) in BOTH its param-less default (Build tab) and its
 *       ?tab=metadata state — pinning the tab bar (Metadata · Build ·
 *       Scoring & Tiers · Access-link · Versions), the Build default, the
 *       Access link, ?tab=metadata routing, AND the full Metadata tab panel.
 *   (b) the INVITED `SectionPager` opening render for a representative
 *       multi-section template, captured BEFORE any `previewMode` change.
 *
 * The ED10 flag does not exist yet, so "flag-OFF ED10" == today's behavior:
 * these tests pass nothing new and must stay green VERBATIM through every
 * later ED10 task. A diff here means an ED10 change leaked into a flag-OFF
 * path — do NOT run `-u` to "fix" it. Stop, diff the .snap by hand, and
 * either scope the change behind the flag or get explicit sign-off (then
 * re-snapshot in its own reviewed commit).
 *
 * ── Determinism note ──────────────────────────────────────────────────────
 * The full editor shell embeds three families of non-deterministic ids that
 * are NOT ED10's concern and cannot be mocked away (dnd-kit + Radix use
 * module/global counters that don't reset between renders; the model's row
 * uids come from genUid() called *inside* the serializers, so mocking the
 * exported genUid does not intercept them). `stabilize()` neutralizes exactly
 * those three families — Radix useId (`radix-_r_N_`), dnd-kit
 * (`DndDescribedBy/LiveRegion-N`), and genUid row uids (`u`+8 base36, harvested
 * from attributes and renumbered in document order). Everything else — every
 * class, label, data-testid, aria state, tab wiring — is pinned verbatim.
 * Proven deterministic: two fresh renders normalize byte-identical.
 */
import { render, cleanup, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";
import { SectionPager } from "@/components/assessments/section-pager";
import {
  buildSectionPages,
  type PagerSection,
  type PagerQuestion,
} from "@/lib/assessments/section-pages";
import { mergeCustomSlides, type SafeSlide } from "@/lib/assessments/custom-slides";

// ── Mocks (mirror forms-build-flag-off-parity / single-column-flag) ───────
const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key),
    toString: () => mockSearchParams.toString(),
  }),
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_2/edit",
}));

beforeEach(() => {
  toastMock.mockClear();
  mockSearchParams = new URLSearchParams("");
});
afterEach(() => cleanup());

/**
 * Neutralize the three non-deterministic id families (see header). Harvested
 * genUid uids are replaced by EXACT string match (never a broad pattern), so
 * no real content/class can be mangled; ordering is by first appearance, so it
 * is stable across renders of the same DOM.
 */
function stabilize(html: string): string {
  let out = html
    .replace(/radix-_r_[0-9a-z]+_/g, "radix-_rID_")
    .replace(/Dnd(DescribedBy|LiveRegion)-\d+/g, "Dnd$1-N");
  const uids = new Set<string>();
  const attrs =
    /(?:data-testid|id|for|aria-describedby|aria-labelledby|aria-controls)="[^"]*?(u[0-9a-z]{8})"/g;
  for (const m of out.matchAll(attrs)) uids.add(m[1]);
  let i = 0;
  for (const uid of uids) out = out.split(uid).join(`UID${i++}`);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// (a) Editor shell — forms mode (ED9 live: singleColumn + formsBuild), ED10
//     flag absent. Fixture shape mirrors forms-build-flag-off-parity.
// ─────────────────────────────────────────────────────────────────────────
const allVersionsMeta = [
  {
    id: "ver_2",
    versionNumber: 2,
    language: "en-US",
    publishedAt: null,
    contentHash: "abcdef012345",
  },
];

function formsModeProps() {
  return {
    template: {
      id: "tpl_1",
      name: "Alpha Template",
      alias: "ALPHA",
      aggregationMode: "FULL_VISIBILITY" as const,
      accessMode: "INVITED" as const,
    },
    version: {
      id: "ver_2",
      versionNumber: 2,
      language: "en-US",
      publishedAt: null,
      contentHash: "abcdef012345",
      sections: [{ stableKey: "S1", name: "Section One" }],
      questions: [
        {
          stableKey: "S1_q1",
          sectionStableKey: "S1",
          label: "Q1 label",
          type: "SLIDER_LIKERT",
          isRequired: true,
          sortOrder: 1,
          scale: { min: 0, max: 10, step: 1, anchorMin: "Low", anchorMax: "High" },
        },
      ],
      scoringConfig: {},
      reportConfig: null,
    },
    allVersions: allVersionsMeta,
    publishedQuestionKeys: [] as string[],
    publishedOptionKeys: {} as Record<string, string[]>,
    waveQEnabled: true,
    questionEditorUnlocked: true,
    findingsEnabled: true,
    conditionalAuthoringEnabled: true,
    testModeEnabled: true,
    safeToPublishEnabled: true,
    versionLifecycleEnabled: true,
    // ED9 production config — the shell to keep byte-identical under ED10.
    singleColumnEnabled: true,
    formsBuildEnabled: true,
  };
}

describe("ED10 golden — forms-mode editor shell (ED10 flag OFF)", () => {
  it("param-less default: Build is the default tab; tab bar + Access link + Build body pinned", () => {
    const { container } = render(<TemplateEditorTabbed {...formsModeProps()} />);

    // Intent guards (survive a `.snap` regen): Build is the param-less default,
    // Metadata exists as a tab, the Access link points at access-groups, and no
    // ED10 Preview/Settings tab has leaked in.
    expect(screen.getByRole("tab", { name: "Build" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByRole("tab", { name: "Metadata" })).toHaveAttribute(
      "data-state",
      "inactive",
    );
    expect(screen.getByTestId("template-editor-access-link")).toHaveAttribute(
      "href",
      "/admin/assessments/access-groups",
    );
    expect(screen.queryByRole("tab", { name: /preview/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /settings/i })).toBeNull();

    expect(stabilize(container.innerHTML)).toMatchSnapshot();
  });

  it("?tab=metadata: routes to the Metadata tab; full Metadata panel pinned", () => {
    mockSearchParams = new URLSearchParams("tab=metadata");
    const { container } = render(<TemplateEditorTabbed {...formsModeProps()} />);

    // Intent guards: ?tab=metadata activates Metadata, Build goes inactive, and
    // the Metadata tab panel is the mounted one.
    expect(screen.getByRole("tab", { name: "Metadata" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByRole("tab", { name: "Build" })).toHaveAttribute(
      "data-state",
      "inactive",
    );
    expect(screen.getByTestId("tab-panel-metadata")).toBeInTheDocument();

    expect(stabilize(container.innerHTML)).toMatchSnapshot();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// (b) INVITED SectionPager — representative multi-section template, opening
//     render, BEFORE any `previewMode` prop exists. Page assembly mirrors
//     org-survey-client.tsx (buildSectionPages → mergeCustomSlides) and the
//     INVITED prop set (assessmentName/companyName/onExit/requireAtLeastOne).
// ─────────────────────────────────────────────────────────────────────────
function makePages(
  secs: PagerSection[],
  qs: PagerQuestion[],
  slides: SafeSlide[] = [],
) {
  return mergeCustomSlides(buildSectionPages(secs, qs), slides).pages;
}

const pagerSections: PagerSection[] = [
  {
    stableKey: "S1",
    sortOrder: 1,
    name: "Strategy",
    description: "How you set direction and priorities.",
    domain: "Strategy",
    partLabel: "Decision 1",
  },
  { stableKey: "S2", sortOrder: 2, name: "Cash" },
];
const pagerQuestions: PagerQuestion[] = [
  {
    stableKey: "S1_q1",
    sortOrder: 1,
    sectionStableKey: "S1",
    type: "SLIDER_LIKERT",
    label: "How confident are you in your strategy?",
    isRequired: true,
    scale: { min: 0, max: 10, step: 1, anchorMin: "Not at all", anchorMax: "Completely" },
  },
  {
    stableKey: "S2_q1",
    sortOrder: 2,
    sectionStableKey: "S2",
    type: "MULTI_CHOICE",
    label: "Which is your biggest cash constraint?",
    isRequired: false,
    options: [
      { key: "K1", label: "Collections" },
      { key: "K2", label: "Margins" },
    ],
  },
];

describe("ED10 golden — INVITED SectionPager (pre-previewMode)", () => {
  it("opening render of a representative multi-section INVITED survey", () => {
    const pages = makePages(pagerSections, pagerQuestions);
    const { container } = render(
      <SectionPager
        pages={pages}
        answers={{}}
        onAnswerChange={() => {}}
        onSubmit={() => {}}
        onExit={() => {}}
        submitting={false}
        assessmentName="Rockefeller Habits"
        companyName="Northwind Logistics"
        requireAtLeastOneAnswer
      />,
    );

    // Intent guards: opens on the first section (Strategy intro + its slider),
    // branded INVITED shell present.
    expect(
      screen.getByRole("heading", { name: "Strategy" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /scaling up/i })).toBeInTheDocument();

    expect(stabilize(container.innerHTML)).toMatchSnapshot();
  });
});
