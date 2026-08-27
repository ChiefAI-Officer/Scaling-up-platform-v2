import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import fixture from "@/__tests__/fixtures/summary-reports/scaling-ceo-full-snapshot.json";
import type { ScalingCeoFullSnapshot } from "@/lib/assessments/summary-reports/canonical";

jest.setTimeout(60_000);

const acceptedTeamZeroSnapshot = fixture as unknown as ScalingCeoFullSnapshot;

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

  it("uses the explicit Not available treatment for the accepted Team-0 state", async () => {
    const rendered = await renderSummaryReportPdf(
      "SCALING_CEO_FULL",
      acceptedTeamZeroSnapshot,
    );
    const inspected = inspectPdf(rendered.bytes);

    expect(inspected.text).toContain("Team average (excludes CEO)");
    expect(inspected.text).toContain("Not available");
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
