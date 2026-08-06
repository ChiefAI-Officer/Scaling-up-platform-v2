/**
 * F4 — Scoring & Tiers tab (Checkpoint 3).
 *
 * Wireframe spec: src/public/wireframes-phase2/admin/18-admin-template-editor-logic.html
 *
 * Plan: ~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md (F4 section + Gap D)
 *
 * Tests written FIRST (TDD red) before implementation.
 */

import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

import {
  ScoringTiersTab,
  type ScoringTiersTabProps,
} from "@/components/admin/template-editor/ScoringTiersTab";

// ─── Fixtures ──────────────────────────────────────────────────────────

const rockefellerSections = [
  { stableKey: "S1", sortOrder: 1, name: "People" },
  { stableKey: "S2", sortOrder: 2, name: "Strategy" },
];

const rockefellerQuestions = [
  {
    stableKey: "Q1",
    sortOrder: 1,
    sectionStableKey: "S1",
    type: "SLIDER_LIKERT" as const,
    label: "Q1",
    isRequired: true,
    scale: { min: 0, max: 3, step: 1, anchorMin: "Low", anchorMax: "High" },
  },
  {
    stableKey: "Q2",
    sortOrder: 2,
    sectionStableKey: "S2",
    type: "SLIDER_LIKERT" as const,
    label: "Q2",
    isRequired: true,
    scale: { min: 0, max: 3, step: 1, anchorMin: "Low", anchorMax: "High" },
  },
];

const rockefellerScoringConfig = {
  tierMetric: "countAchieved" as const,
  passThreshold: 2,
  tiers: [
    { minMetric: 0, maxMetric: 16, label: "Low", message: "That is a very low overall score." },
    { minMetric: 17, maxMetric: 32, label: "OK", message: "You're doing quite okay, and have a lot to improve further upon." },
    { minMetric: 33, maxMetric: 40, label: "Great", message: "That is a great overall score." },
  ],
};

const suFullScoringConfig = {
  ...rockefellerScoringConfig,
  tierMetric: "overallAvg" as const,
  rollup: { overall: "meanOfDomains" as const },
  scaleUpScore: true,
  tiers: [
    { minMetric: 0, maxMetric: 3, label: "Critical", message: "..." },
    { minMetric: 3, maxMetric: 5, label: "At Risk", message: "..." },
    { minMetric: 5, maxMetric: 7, label: "On Track", message: "..." },
    { minMetric: 7, maxMetric: 10, label: "Strong", message: "..." },
  ],
  domains: [
    {
      key: "PEOPLE",
      label: "People",
      tiers: [
        { minMetric: 0, maxMetric: 3, label: "Critical", message: "..." },
        { minMetric: 3, maxMetric: 5, label: "At Risk", message: "..." },
        { minMetric: 5, maxMetric: 7, label: "On Track", message: "..." },
        { minMetric: 7, maxMetric: 10, label: "Strong", message: "..." },
      ],
    },
    {
      key: "STRATEGY",
      label: "Strategy",
      tiers: [
        { minMetric: 0, maxMetric: 3, label: "Critical", message: "..." },
        { minMetric: 3, maxMetric: 5, label: "At Risk", message: "..." },
        { minMetric: 5, maxMetric: 7, label: "On Track", message: "..." },
        { minMetric: 7, maxMetric: 10, label: "Strong", message: "..." },
      ],
    },
  ],
};

function makeProps(
  overrides: Partial<ScoringTiersTabProps> = {},
): ScoringTiersTabProps {
  return {
    sections: rockefellerSections,
    questions: rockefellerQuestions,
    scoringConfig: rockefellerScoringConfig,
    isReadOnly: false,
    onScoringConfigChange: jest.fn(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe("ScoringTiersTab — F4 (Checkpoint 3)", () => {
  describe("plain-language scoring copy", () => {
    it("shows approved author language while preserving raw metric values and callbacks", () => {
      const onChange = jest.fn();
      const { container } = render(
        <ScoringTiersTab
          {...makeProps({ onScoringConfigChange: onChange })}
          plainLanguageEnabled
        />,
      );

      expect(screen.getByText("How results are calculated")).toBeInTheDocument();
      const metricSelect = screen.getByLabelText("Overall result is based on");
      expect(metricSelect).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Questions passed" }),
      ).toHaveValue("countAchieved");
      expect(
        screen.getByRole("option", { name: "Sum of all answers" }),
      ).toHaveValue("overallTotal");
      expect(
        screen.getByRole("option", {
          name: "Average across all questions",
        }),
      ).toHaveValue("overallAvg");
      expect(screen.getByText("Overall result tiers")).toBeInTheDocument();
      expect(
        screen.getByRole("columnheader", { name: "Starts at" }),
      ).toBeInTheDocument();
      expect(screen.getAllByPlaceholderText("No maximum")).not.toHaveLength(0);
      expect(screen.getByText("Before you can publish")).toBeInTheDocument();
      expect(screen.getByText("Example result")).toBeInTheDocument();

      for (const forbiddenTerm of [
        "countAchieved",
        "overallTotal",
        "overallAvg",
        "minMetric",
        "maxMetric",
        "Zod refine",
        "Gap D",
        "D2 extension",
        "Tier Resolution",
        "unbounded",
      ]) {
        expect(container.textContent).not.toContain(forbiddenTerm);
      }

      fireEvent.change(metricSelect, { target: { value: "overallTotal" } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ tierMetric: "overallTotal" }),
      );
    });

    it("hides stored area keys and labels editable cells for assistive technology", () => {
      render(
        <ScoringTiersTab
          {...makeProps({ scoringConfig: suFullScoringConfig })}
          plainLanguageEnabled
        />,
      );

      expect(screen.getByText("Results by area")).toBeInTheDocument();
      expect(screen.queryByText("(PEOPLE)")).not.toBeInTheDocument();
      expect(screen.getAllByLabelText("Starts at for Critical")).not.toHaveLength(0);
      expect(screen.getAllByLabelText("Ends at for Critical")).not.toHaveLength(0);
      expect(screen.getAllByLabelText("Result name for tier 1")).not.toHaveLength(0);
      expect(screen.getAllByLabelText("Message shown for Critical")).not.toHaveLength(0);
    });

    it("falls back to the tier number for whitespace-only result names without trimming the stored label", () => {
      function StatefulScoringTiersTab() {
        const [scoringConfig, setScoringConfig] = React.useState(
          rockefellerScoringConfig,
        );

        return (
          <ScoringTiersTab
            {...makeProps({
              scoringConfig,
              onScoringConfigChange: setScoringConfig,
            })}
            plainLanguageEnabled
          />
        );
      }

      render(<StatefulScoringTiersTab />);

      fireEvent.change(screen.getByLabelText("Result name for tier 1"), {
        target: { value: "   " },
      });

      expect(screen.getByLabelText("Result name for tier 1")).toHaveValue("   ");
      expect(screen.getByLabelText("Starts at for tier 1")).toBeInTheDocument();
      expect(screen.getByLabelText("Ends at for tier 1")).toBeInTheDocument();
      expect(screen.getByLabelText("Message shown for tier 1")).toBeInTheDocument();
    });

    it("formats local range validation without exposing stored field names", () => {
      const broken = {
        ...rockefellerScoringConfig,
        tiers: [
          { minMetric: 0, maxMetric: 16, label: "Low", message: "." },
          { minMetric: 18, maxMetric: 32, label: "OK", message: "." },
        ],
      };
      render(
        <ScoringTiersTab
          {...makeProps({ scoringConfig: broken })}
          plainLanguageEnabled
        />,
      );

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(
        'Overall result tiers: "Low" ends at 16; "OK" must start at 17.',
      );
      expect(alert).not.toHaveTextContent(/minMetric|maxMetric|Global tiers/);
    });

    it("keeps every legacy label verbatim when the prop is absent", () => {
      render(
        <ScoringTiersTab
          {...makeProps({ scoringConfig: suFullScoringConfig })}
        />,
      );

      expect(screen.getByText("Scoring Configuration")).toBeInTheDocument();
      expect(screen.getByLabelText("Tier Metric")).toBeInTheDocument();
      expect(
        screen.getByRole("option", {
          name: "countAchieved — Count of questions with score ≥ passThreshold",
        }),
      ).toHaveValue("countAchieved");
      expect(
        screen.getByRole("option", {
          name: "overallTotal — Sum of all numeric values",
        }),
      ).toHaveValue("overallTotal");
      expect(
        screen.getByRole("option", {
          name: "overallAvg — Mean of all numeric values",
        }),
      ).toHaveValue("overallAvg");
      expect(screen.getByLabelText("Pass Threshold")).toBeInTheDocument();
      expect(
        screen.getAllByRole("columnheader", { name: "minMetric" }),
      ).not.toHaveLength(0);
      expect(
        screen.getAllByRole("columnheader", { name: "maxMetric" }),
      ).not.toHaveLength(0);
      expect(screen.getByText("Preview — Tier Resolution")).toBeInTheDocument();
      expect(screen.getByText("Per-domain tiers")).toBeInTheDocument();
      expect(screen.getByText("(PEOPLE)")).toBeInTheDocument();
    });
  });

  describe("Scoring Configuration card (WF18)", () => {
    it("renders the card with title 'Scoring Configuration' + WF18 subtitle", () => {
      render(<ScoringTiersTab {...makeProps()} />);
      expect(screen.getByText("Scoring Configuration")).toBeInTheDocument();
      expect(
        screen.getByText(
          /How responses convert into a headline metric and tier message/i,
        ),
      ).toBeInTheDocument();
    });

    it("Tier Metric select has 3 options with verbatim WF18 labels", () => {
      render(<ScoringTiersTab {...makeProps()} />);
      const select = screen.getByLabelText(/Tier Metric/i) as HTMLSelectElement;
      const options = within(select).getAllByRole("option");
      expect(options).toHaveLength(3);
      expect(options[0]).toHaveTextContent(
        /countAchieved — Count of questions with score ≥ passThreshold/,
      );
      expect(options[1]).toHaveTextContent(
        /overallTotal — Sum of all numeric values/,
      );
      expect(options[2]).toHaveTextContent(
        /overallAvg — Mean of all numeric values/,
      );
    });

    it("renders Pass Threshold number input bound to scoringConfig.passThreshold", () => {
      render(<ScoringTiersTab {...makeProps()} />);
      const input = screen.getByLabelText(/Pass Threshold/i) as HTMLInputElement;
      expect(input).toHaveValue(2);
    });

    it("editing Pass Threshold calls onScoringConfigChange", () => {
      const onChange = jest.fn();
      render(<ScoringTiersTab {...makeProps({ onScoringConfigChange: onChange })} />);
      const input = screen.getByLabelText(/Pass Threshold/i);
      fireEvent.change(input, { target: { value: "3" } });
      expect(onChange).toHaveBeenCalled();
    });
  });

  describe("Tiers table (WF18 lines 891-900)", () => {
    it("renders columns in WF18 order: Order / minMetric / maxMetric / Label / Message / Action", () => {
      render(<ScoringTiersTab {...makeProps()} />);
      const headers = screen.getAllByRole("columnheader");
      const labels = headers.map((h) => h.textContent?.trim());
      expect(labels).toEqual([
        "Order",
        "minMetric",
        "maxMetric",
        "Label",
        "Message",
        "Action",
      ]);
    });

    it("renders one row per tier with inline-editable inputs", () => {
      render(<ScoringTiersTab {...makeProps()} />);
      const rows = screen.getAllByTestId(/^global-tier-row-/);
      expect(rows).toHaveLength(3);
    });

    it("editing a tier minMetric calls onScoringConfigChange", () => {
      const onChange = jest.fn();
      render(<ScoringTiersTab {...makeProps({ onScoringConfigChange: onChange })} />);
      const minInputs = screen.getAllByTestId(/^global-tier-min-/);
      fireEvent.change(minInputs[1], { target: { value: "18" } });
      expect(onChange).toHaveBeenCalled();
    });

    it("+ Add Tier appends a new tier row", () => {
      const onChange = jest.fn();
      render(<ScoringTiersTab {...makeProps({ onScoringConfigChange: onChange })} />);
      const addBtn = screen.getByRole("button", { name: /\+ Add Tier/i });
      fireEvent.click(addBtn);
      expect(onChange).toHaveBeenCalled();
    });

    it("Remove button removes a tier", () => {
      const onChange = jest.fn();
      render(<ScoringTiersTab {...makeProps({ onScoringConfigChange: onChange })} />);
      const removeBtns = screen.getAllByRole("button", { name: /^Remove$/i });
      fireEvent.click(removeBtns[0]);
      expect(onChange).toHaveBeenCalled();
    });

    it("validation hint card renders with 4 bullets", () => {
      render(<ScoringTiersTab {...makeProps()} />);
      const note = screen.getByRole("note");
      const bullets = within(note).getAllByRole("listitem");
      expect(bullets.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("Live preview card", () => {
    it("renders preview card with title 'Preview — Tier Resolution'", () => {
      render(<ScoringTiersTab {...makeProps()} />);
      expect(screen.getByText(/Preview — Tier Resolution/i)).toBeInTheDocument();
    });

    it("renders a score and resolved tier label OR a fallback message", () => {
      render(<ScoringTiersTab {...makeProps()} />);
      const preview = screen.getByTestId("tier-preview");
      // Either shows score → tier OR fallback
      const text = preview.textContent ?? "";
      const hasScore = /score|tier/i.test(text);
      const hasFallback = /preview unavailable/i.test(text);
      expect(hasScore || hasFallback).toBe(true);
    });
  });

  describe("Per-domain tiers section (Gap D — D2 extension)", () => {
    it("does NOT render when scoringConfig.domains is absent (Rockefeller)", () => {
      render(<ScoringTiersTab {...makeProps()} />);
      expect(screen.queryByText(/Per-domain tiers/i)).not.toBeInTheDocument();
    });

    it("renders one sub-table per domain when scoringConfig.domains present (SU Full)", () => {
      render(
        <ScoringTiersTab
          {...makeProps({ scoringConfig: suFullScoringConfig })}
        />,
      );
      expect(screen.getByText(/Per-domain tiers/i)).toBeInTheDocument();
      expect(screen.getByTestId("domain-card-PEOPLE")).toBeInTheDocument();
      expect(screen.getByTestId("domain-card-STRATEGY")).toBeInTheDocument();
    });

    it("each domain card shows label + key + tier table", () => {
      render(
        <ScoringTiersTab
          {...makeProps({ scoringConfig: suFullScoringConfig })}
        />,
      );
      const card = screen.getByTestId("domain-card-PEOPLE");
      expect(within(card).getByText(/People/)).toBeInTheDocument();
      expect(within(card).getByText(/PEOPLE/)).toBeInTheDocument();
      // 4 tier rows per domain
      const rows = within(card).getAllByTestId(/^domain-tier-PEOPLE-row-/);
      expect(rows).toHaveLength(4);
    });

    it("editing a per-domain tier minMetric calls onScoringConfigChange", () => {
      const onChange = jest.fn();
      render(
        <ScoringTiersTab
          {...makeProps({
            scoringConfig: suFullScoringConfig,
            onScoringConfigChange: onChange,
          })}
        />,
      );
      const card = screen.getByTestId("domain-card-PEOPLE");
      const mins = within(card).getAllByTestId(/^domain-tier-PEOPLE-min-/);
      fireEvent.change(mins[1], { target: { value: "3.5" } });
      expect(onChange).toHaveBeenCalled();
    });
  });

  describe("Deferred logic placeholders (per WF18 lines 990-1109)", () => {
    it("Conditional Sections ghost card is REMOVED (Wave W, spec 19w D5 — superseded by Wave U findings; show-if authoring lives in the Questions tab)", () => {
      render(<ScoringTiersTab {...makeProps()} />);
      expect(screen.queryByTestId("deferred-conditional-sections")).toBeNull();
      expect(screen.queryByText(/conditionalSections/)).toBeNull();
    });

    it("Peer Benchmarks ghost card is REMOVED (Wave W leftovers, spec 19z — superseded by the live Wave S peer-averages panel)", () => {
      render(<ScoringTiersTab {...makeProps()} />);
      expect(screen.queryByTestId("deferred-peer-benchmarks")).toBeNull();
      expect(screen.queryByText(/Peer Benchmarks/i)).toBeNull();
    });
  });

  describe("Explanation card", () => {
    it("is REMOVED (Wave W leftovers, spec 19z — the deferred-logic explanation card went out with the ghost placeholders it explained)", () => {
      render(<ScoringTiersTab {...makeProps()} />);
      expect(
        screen.queryByText(/Why is this section deferred/i),
      ).toBeNull();
    });
  });

  describe("Read-only mode (published version)", () => {
    it("disables all interactive inputs when isReadOnly=true", () => {
      render(<ScoringTiersTab {...makeProps({ isReadOnly: true })} />);
      // Tier Metric select disabled
      expect(screen.getByLabelText(/Tier Metric/i)).toBeDisabled();
      // Pass Threshold disabled
      expect(screen.getByLabelText(/Pass Threshold/i)).toBeDisabled();
      // All tier inputs disabled
      const minInputs = screen.getAllByTestId(/^global-tier-min-/);
      minInputs.forEach((el) => expect(el).toBeDisabled());
      // Add Tier button disabled (or absent)
      const addBtn = screen.queryByRole("button", { name: /\+ Add Tier/i });
      if (addBtn) expect(addBtn).toBeDisabled();
      // Remove buttons disabled
      const removeBtns = screen.queryAllByRole("button", { name: /^Remove$/i });
      removeBtns.forEach((el) => expect(el).toBeDisabled());
    });
  });

  describe("Validation (mirrors E1 engine semantics)", () => {
    it("renders an inline alert when global tiers have a gap (integer mode)", () => {
      const broken = {
        ...rockefellerScoringConfig,
        tiers: [
          { minMetric: 0, maxMetric: 16, label: "Low", message: "." },
          { minMetric: 18, maxMetric: 32, label: "OK", message: "." }, // gap
        ],
      };
      render(<ScoringTiersTab {...makeProps({ scoringConfig: broken })} />);
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/gap|17/i);
    });

    it("renders an inline alert when global tiers overlap", () => {
      const broken = {
        ...rockefellerScoringConfig,
        tiers: [
          { minMetric: 0, maxMetric: 16, label: "Low", message: "." },
          { minMetric: 15, maxMetric: 32, label: "OK", message: "." }, // overlap
        ],
      };
      render(<ScoringTiersTab {...makeProps({ scoringConfig: broken })} />);
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("does NOT render an alert when global tiers are clean", () => {
      // ED5 T16/T17: the live domain-aware check (validateTierTiling) now also
      // runs. The 2-question fixture's `countAchieved` domain is [0, 2], so the
      // "clean" tiers must actually tile [0, 2] (the base fixture's 0–40 tiers
      // were only contiguity-clean, not domain-spanning — the Wave V gap the
      // rider closes).
      const clean = {
        ...rockefellerScoringConfig,
        tiers: [
          { minMetric: 0, maxMetric: 1, label: "Low", message: "." },
          { minMetric: 2, maxMetric: 2, label: "High", message: "." },
        ],
      };
      render(<ScoringTiersTab {...makeProps({ scoringConfig: clean })} />);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("ED5 T17/T18 — visual band bars (B-5)", () => {
    it("renders the global band bar for a finite (countAchieved) domain", () => {
      const cfg = {
        ...rockefellerScoringConfig,
        tiers: [
          { minMetric: 0, maxMetric: 1, label: "Low", message: "." },
          { minMetric: 2, maxMetric: 2, label: "High", message: "." },
        ],
      };
      render(<ScoringTiersTab {...makeProps({ scoringConfig: cfg })} />);
      expect(screen.getByTestId("global-tier-band-bar")).toBeInTheDocument();
      expect(screen.getByTestId("global-tier-band-divider-0")).toBeInTheDocument();
    });

    it("renders a per-domain band bar for a domain with matching-scale questions", () => {
      const domainSections = [
        { stableKey: "S1", sortOrder: 1, name: "People", domain: "D1" },
      ];
      const domainQuestions = [
        {
          stableKey: "Q1",
          sortOrder: 1,
          sectionStableKey: "S1",
          type: "SLIDER_LIKERT" as const,
          label: "Q1",
          isRequired: true,
          scale: { min: 0, max: 3, step: 1, anchorMin: "Low", anchorMax: "High" },
        },
      ];
      const cfg = {
        tierMetric: "overallAvg" as const,
        passThreshold: 2,
        rollup: { overall: "meanOfDomains" as const },
        tiers: [
          { minMetric: 0, maxMetric: 1.5, label: "Low", message: "." },
          { minMetric: 1.5, maxMetric: 3, label: "High", message: "." },
        ],
        domains: [
          {
            key: "D1",
            label: "Domain 1",
            tiers: [
              { minMetric: 0, maxMetric: 1.5, label: "Low", message: "." },
              { minMetric: 1.5, maxMetric: 3, label: "High", message: "." },
            ],
          },
        ],
      };
      render(
        <ScoringTiersTab
          {...makeProps({
            sections: domainSections,
            questions: domainQuestions,
            scoringConfig: cfg,
          })}
        />,
      );
      expect(
        screen.getByTestId("domain-tier-band-D1-bar"),
      ).toBeInTheDocument();
    });
  });
});
