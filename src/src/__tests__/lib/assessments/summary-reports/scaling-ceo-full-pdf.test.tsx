import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import fixture from "@/__tests__/fixtures/summary-reports/scaling-ceo-full-snapshot.json";
import type { ScalingCeoFullSnapshot } from "@/lib/assessments/summary-reports/canonical";

jest.setTimeout(60_000);

const acceptedTeamZeroSnapshot = fixture as unknown as ScalingCeoFullSnapshot;

const ACCEPTED_CEO_VALUES = [
  5, 10, 8, 9, 10, 5, 3, 0, 10, 10, 8, 10, 10, 2, 2, 6, 8, 2, 8, 7, 10, 10, 10,
  2, 10, 8, 0, 9, 2, 8, 9, 10, 5, 10, 7, 4, 5, 5, 5, 0, 9, 6, 6, 2, 0, 10, 0, 8,
  10, 10, 10, 3, 2, 10, 10, 10, 10, 10, 10, 10, 10,
] as const;

const ACCEPTED_PEER_VALUES = [
  6.3, 7.2, 5.6, 5.9, 6.2, 4.6, 4.4, 5.5, 7.2, 6.4, 5.7, 5.2, 7.3, 6.7, 6, 5.4,
  5.3, 4.9, 4.2, 2.4, 6.2, 6, 5.9, 4.7, 5.8, 5.9, 5, 5.6, 5.7, 5.6, 6.1, 6.4,
  5.9, 5, 6.2, 6.2, 6.3, 6.9, 6.7, 6.2, 8, 7, 5.8, 6.9, 7.8, 5.8, 5, 5.8, 4, 3,
  6.5, 6, 5.1, 6.2, 5.9, 4.8, 5.6, 5, 5.9, 6.4, 5.6,
] as const;

function normalizedVisibleText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const rendererScratchRoot = join(process.cwd(), "tmp", "pdfs");
mkdirSync(rendererScratchRoot, { recursive: true });
const rendererBuildDir = mkdtempSync(
  join(rendererScratchRoot, "summary-renderer-test-"),
);
const rendererBuildPath = join(rendererBuildDir, "renderer.mjs");

beforeAll(() => {
  execFileSync(join(process.cwd(), "node_modules", ".bin", "esbuild"), [
    "src/lib/assessments/summary-reports/renderers/index.tsx",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--packages=external",
    "--jsx=automatic",
    `--outfile=${rendererBuildPath}`,
  ]);
});

afterAll(() => {
  rmSync(rendererBuildDir, { recursive: true, force: true });
});

async function renderSummaryReportPdf(
  reportType: "SCALING_CEO_FULL",
  snapshot: ScalingCeoFullSnapshot,
): Promise<{ bytes: Buffer }> {
  expect(reportType).toBe("SCALING_CEO_FULL");
  const rendererUrl = pathToFileURL(rendererBuildPath).href;
  const script = `
    import { readFileSync } from "node:fs";
    import { renderSummaryReportPdf } from ${JSON.stringify(rendererUrl)};

    const snapshot = JSON.parse(readFileSync(0, "utf8"));
    const rendered = await renderSummaryReportPdf("SCALING_CEO_FULL", snapshot);
    process.stdout.write(rendered.bytes);
  `;
  return {
    bytes: execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", script],
      { input: JSON.stringify(snapshot), maxBuffer: 20 * 1024 * 1024 },
    ),
  };
}

const INSPECT_PDF_SCRIPT = `
  import { readFileSync } from "node:fs";
  import { PDFParse } from "pdf-parse";

  const parser = new PDFParse({ data: readFileSync(0) });
  try {
    const text = await parser.getText();
    const info = await parser.getInfo({ parsePageInfo: true });
    process.stdout.write(JSON.stringify({
      text: text.text.replace(/\\r/g, "").trim(),
      pageTexts: text.pages.map((page) => page.text.replace(/\\r/g, "").trim()),
      title: info.info?.Title,
      pages: info.total,
    }));
  } finally {
    await parser.destroy();
  }
`;

function inspectPdf(bytes: Buffer): {
  text: string;
  pageTexts: string[];
  title?: string;
  pages: number;
} {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", INSPECT_PDF_SCRIPT],
      { input: bytes },
    ).toString("utf8"),
  );
}

function teamPopulatedSnapshot(): ScalingCeoFullSnapshot {
  const snapshot = JSON.parse(
    JSON.stringify(acceptedTeamZeroSnapshot),
  ) as ScalingCeoFullSnapshot;
  const model = snapshot.reportModel;
  const scored = model.scored;
  if (!scored) throw new Error("Fixture must carry the scored model");

  snapshot.sources.push(
    {
      submissionId: "fixture-submission-team-1",
      sourceCampaignId: snapshot.destination.campaignId,
      role: "TEAM",
      position: 0,
      submittedAt: "2026-08-26T22:10:00.000Z",
      respondent: {
        id: "fixture-respondent-team-1",
        displayName: "Taylor Rowan",
        jobTitle: "Chief Operating Officer",
      },
      answers: [],
      result: {},
    },
    {
      submissionId: "fixture-submission-team-2",
      sourceCampaignId: snapshot.destination.campaignId,
      role: "TEAM",
      position: 1,
      submittedAt: "2026-08-26T22:20:00.000Z",
      respondent: {
        id: "fixture-respondent-team-2",
        displayName: "Morgan Lane",
        jobTitle: "Chief Financial Officer",
      },
      answers: [],
      result: {},
    },
  );
  model.respondents.push(
    {
      respondentId: "summary-source:fixture-submission-team-1",
      name: "Taylor Rowan",
      jobTitle: "Chief Operating Officer",
      isCEO: false,
      isOrphan: false,
    },
    {
      respondentId: "summary-source:fixture-submission-team-2",
      name: "Morgan Lane",
      jobTitle: "Chief Financial Officer",
      isCEO: false,
      isOrphan: false,
    },
  );
  model.respondentCount = 3;
  snapshot.provenance.completedCount = 3;
  snapshot.provenance.invitedCount = 3;
  snapshot.provenance.submissionIds.push(
    "fixture-submission-team-1",
    "fixture-submission-team-2",
  );

  for (const row of [...scored.sections, ...(scored.domains ?? [])]) {
    row.teamAvg = Math.max(0, (row.ceo ?? 0) - 1.5);
    row.dev = row.ceo === null ? null : row.ceo - row.teamAvg;
    row.devPeersTeam = row.peers == null ? null : row.teamAvg - row.peers;
    row.n = 2;
  }
  for (const row of scored.questions) {
    row.teamMean = Math.max(0, (row.ceo ?? 0) - 2);
    row.n = 2;
  }
  if (!scored.scaleUpScore) throw new Error("Fixture must carry ScaleUp Score");
  scored.scaleUpScore.teamAvg = 54;
  scored.tier.teamDistribution = [
    { label: "On the way", count: 1 },
    { label: "Not ready", count: 1 },
  ];
  scored.appendixB = [
    scored.appendixB?.[0] ?? {
      personLabel: "CEO",
      domainScores: { people: 7.9, strategy: 5, execution: 6.6, cash: 4.6 },
    },
    {
      personLabel: "Person 1",
      domainScores: { people: 6.4, strategy: 5.5, execution: 5.1, cash: 4.2 },
    },
    {
      personLabel: "Person 2",
      domainScores: { people: 5.8, strategy: 6.1, execution: 4.9, cash: 5.3 },
    },
  ];

  return snapshot;
}

function teamFiftySnapshot(): ScalingCeoFullSnapshot {
  const snapshot = JSON.parse(
    JSON.stringify(acceptedTeamZeroSnapshot),
  ) as ScalingCeoFullSnapshot;
  const scored = snapshot.reportModel.scored;
  if (!scored) throw new Error("Fixture must carry the scored model");

  for (let index = 1; index <= 50; index += 1) {
    const submissionId = `fixture-submission-team-${index}`;
    const respondentId = `fixture-respondent-team-${index}`;
    snapshot.sources.push({
      submissionId,
      sourceCampaignId: snapshot.destination.campaignId,
      role: "TEAM",
      position: index - 1,
      submittedAt: `2026-08-26T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
      respondent: {
        id: respondentId,
        displayName: `Synthetic Team ${index}`,
        jobTitle: null,
      },
      answers: [],
      result: {},
    });
    snapshot.reportModel.respondents.push({
      respondentId: `summary-source:${submissionId}`,
      name: `Synthetic Team ${index}`,
      jobTitle: null,
      isCEO: false,
      isOrphan: false,
    });
    snapshot.provenance.submissionIds.push(submissionId);
  }
  snapshot.reportModel.respondentCount = 51;
  snapshot.provenance.completedCount = 51;
  snapshot.provenance.invitedCount = 51;

  for (const row of [...scored.sections, ...(scored.domains ?? [])]) {
    row.teamAvg = 5;
    row.dev = row.ceo === null ? null : row.ceo - 5;
    row.devPeersTeam = row.peers == null ? null : 5 - row.peers;
    row.n = 50;
  }
  for (const row of scored.questions) {
    row.teamMean = 5;
    row.n = 50;
  }
  if (scored.scaleUpScore) scored.scaleUpScore.teamAvg = 50;
  scored.appendixB = [
    scored.appendixB?.[0] ?? {
      personLabel: "CEO",
      domainScores: { people: 7.9, strategy: 5, execution: 6.6, cash: 4.6 },
    },
    ...Array.from({ length: 50 }, (_entry, offset) => {
      const person = offset + 1;
      const score = (shift: number) => ((person + shift) % 101) / 10;
      return {
        personLabel: `Person ${person}`,
        domainScores: {
          people: score(0),
          strategy: score(17),
          execution: score(34),
          cash: score(51),
        },
      };
    }),
  ];

  return snapshot;
}

describe("Scaling CEO Full PDF renderer", () => {
  it("renders a titled PDF with the accepted section sequence and named CEO", async () => {
    const rendered = await renderSummaryReportPdf(
      "SCALING_CEO_FULL",
      acceptedTeamZeroSnapshot,
    );
    const inspected = inspectPdf(rendered.bytes);

    expect(rendered.bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(inspected.title).toBeTruthy();
    expect(inspected.text).toContain("Scaling Up");
    expect(inspected.text).toContain("Group Report");
    expect(inspected.text).toContain("Alignment Profile");
    expect(inspected.text).toContain("ScaleUp Score");
    expect(inspected.text).toContain("Question Detail");
    expect(inspected.text).toContain("Appendix B");
    expect(inspected.text).toContain("Avery Morgan");
    expect(inspected.pages).toBeGreaterThanOrEqual(2);
    expect(inspected.pageTexts).toHaveLength(inspected.pages);
    inspected.pageTexts.forEach((pageText, index) => {
      expect(pageText).toContain(
        "Northstar Growth Review | scaling-ceo-full-pdf-v1",
      );
      expect(pageText).toContain(`Page ${index + 1} / ${inspected.pages}`);
    });
  });

  it("renders exact creation provenance and separately identifies Section and Domain peers", async () => {
    const rendered = await renderSummaryReportPdf(
      "SCALING_CEO_FULL",
      acceptedTeamZeroSnapshot,
    );
    const inspected = inspectPdf(rendered.bytes);
    const provenancePage = inspected.pageTexts[1];

    expect(provenancePage).toContain("CREATED AT (UTC)");
    expect(provenancePage).toContain("2026-08-27 01:11:00 UTC");
    expect(provenancePage).toContain("SELECTED / COMPLETED / INVITED");
    expect(provenancePage).toContain("1 selected / 1 completed / 1 invited");
    expect(provenancePage).toContain("ASSESSMENT / PINNED VERSION");
    expect(provenancePage).toContain(
      "Scaling Up Full Assessment / scaling-up-full-v6",
    );
    expect(provenancePage).toContain("CEO");
    expect(provenancePage).toContain("Avery Morgan");
    expect(provenancePage).toContain("Section scores - CEO vs Team vs Peers");
    expect(provenancePage).toContain("Domain scores - CEO vs Team vs Peers");
    expect(provenancePage.match(/CEO vs peers/g)).toHaveLength(2);
    expect(inspected.text).not.toContain("Peer Comparison");
  });

  it("renders CEO-excluded Team comparisons without exposing Team names", async () => {
    const rendered = await renderSummaryReportPdf(
      "SCALING_CEO_FULL",
      teamPopulatedSnapshot(),
    );
    const inspected = inspectPdf(rendered.bytes);

    expect(inspected.text).toContain("Team average (excludes CEO)");
    expect(inspected.text).toContain("Person 1");
    expect(inspected.text).toContain("Person 2");
    expect(inspected.text).not.toContain("Taylor Rowan");
    expect(inspected.text).not.toContain("Morgan Lane");
  });

  it("renders the exact Q01-Q61 CEO, Team, and accepted Peers sequence with disclosure", async () => {
    const snapshot = teamPopulatedSnapshot();
    const questions = snapshot.reportModel.scored!.questions;
    const peerQuestions = snapshot.peerBenchmark.questions as Record<
      string,
      number
    >;
    const ids = ACCEPTED_CEO_VALUES.map(
      (_value, index) => `Q${String(index + 1).padStart(2, "0")}`,
    );

    expect(questions.map((row) => row.stableKey)).toEqual(ids);
    expect(questions.map((row) => row.ceo)).toEqual(ACCEPTED_CEO_VALUES);
    expect(ids.map((id) => peerQuestions[id])).toEqual(ACCEPTED_PEER_VALUES);

    const rendered = await renderSummaryReportPdf("SCALING_CEO_FULL", snapshot);
    const inspected = inspectPdf(rendered.bytes);
    const detailText = normalizedVisibleText(
      inspected.pageTexts
        .filter((page) => page.includes("Question Detail"))
        .join(" "),
    );

    let cursor = 0;
    questions.forEach((question, index) => {
      const label = normalizedVisibleText(question.label);
      const start = detailText.indexOf(label, cursor);
      expect(start).toBeGreaterThanOrEqual(cursor);
      const nextLabel = questions[index + 1]
        ? normalizedVisibleText(questions[index + 1].label)
        : "";
      const end = nextLabel ? detailText.indexOf(nextLabel, start + 1) : -1;
      const rowText = detailText.slice(start, end === -1 ? undefined : end);
      const ceo = ACCEPTED_CEO_VALUES[index];
      const team = Math.max(0, ceo - 2);
      const peers = ACCEPTED_PEER_VALUES[index];
      expect(rowText).toContain(`${ceo} ${team} ${peers}`);
      cursor = start + label.length;
    });

    expect(inspected.text).toContain(
      "2026-08-14.question-controlled-aggregate-provisional",
    );
    expect(inspected.text).toContain("provisional industry benchmark");
    expect(inspected.text).toContain("single Esperto cohort");
    expect(inspected.text).toContain("not yet size-matched");
  });

  it("uses the explicit Not available treatment for the accepted Team-0 state", async () => {
    const rendered = await renderSummaryReportPdf(
      "SCALING_CEO_FULL",
      acceptedTeamZeroSnapshot,
    );
    const inspected = inspectPdf(rendered.bytes);

    expect(inspected.text).toContain("Team average (excludes CEO)");
    expect(inspected.text).toContain("Not available");
  });

  it("paginates 50 Team members with repeated Appendix identity and intact boundary rows", async () => {
    const rendered = await renderSummaryReportPdf(
      "SCALING_CEO_FULL",
      teamFiftySnapshot(),
    );
    const inspected = inspectPdf(rendered.bytes);
    const appendixPages = inspected.pageTexts.filter((page) =>
      page.includes("Appendix B"),
    );

    expect(appendixPages).toHaveLength(3);
    expect(inspected.pages).toBe(10);
    inspected.pageTexts.forEach((pageText, index) => {
      expect(pageText).toContain(
        "Northstar Growth Review | scaling-ceo-full-pdf-v1",
      );
      expect(pageText).toContain(`Page ${index + 1} / 10`);
    });
    appendixPages.forEach((page, index) => {
      expect(page).toContain(
        index === 0
          ? "Appendix B - Team Members (Anonymized)"
          : "Appendix B - Team Members (Anonymized) (continued)",
      );
      expect(normalizedVisibleText(page)).toContain(
        "Member People Strategy Execution Cash",
      );
    });

    expect(appendixPages[0]).toContain("CEO");
    expect(appendixPages[0]).toMatch(/Person 1(?!\d)/);
    expect(appendixPages[0]).toMatch(/Person 19(?!\d)/);
    expect(appendixPages[0]).not.toMatch(/Person 20(?!\d)/);
    expect(appendixPages[1]).toMatch(/Person 20(?!\d)/);
    expect(appendixPages[1]).toMatch(/Person 39(?!\d)/);
    expect(appendixPages[1]).not.toMatch(/Person 40(?!\d)/);
    expect(appendixPages[2]).toMatch(/Person 40(?!\d)/);
    expect(appendixPages[2]).toMatch(/Person 50(?!\d)/);

    expect(normalizedVisibleText(appendixPages[0])).toContain(
      "Person 19 1.9 3.6 5.3 7",
    );
    expect(normalizedVisibleText(appendixPages[1])).toContain(
      "Person 20 2 3.7 5.4 7.1",
    );
    expect(normalizedVisibleText(appendixPages[1])).toContain(
      "Person 39 3.9 5.6 7.3 9",
    );
    expect(normalizedVisibleText(appendixPages[2])).toContain(
      "Person 40 4 5.7 7.4 9.1",
    );
    expect(normalizedVisibleText(appendixPages[2])).toContain(
      "Person 50 5 6.7 8.4 0",
    );

    for (let person = 1; person <= 50; person += 1) {
      expect(
        inspected.text.match(new RegExp(`Person ${person}(?!\\d)`, "g")),
      ).toHaveLength(1);
    }
  });

  it("has deterministic visible text for an identical frozen snapshot", async () => {
    const [first, second] = await Promise.all([
      renderSummaryReportPdf("SCALING_CEO_FULL", acceptedTeamZeroSnapshot),
      renderSummaryReportPdf("SCALING_CEO_FULL", acceptedTeamZeroSnapshot),
    ]);
    const firstText = inspectPdf(first.bytes);
    const secondText = inspectPdf(second.bytes);

    expect(secondText.text).toBe(firstText.text);
  });
});
