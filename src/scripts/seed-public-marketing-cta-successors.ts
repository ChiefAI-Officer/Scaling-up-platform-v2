import { Prisma } from "@prisma/client";

import { db } from "../src/lib/db";
import { activePublishedWhere, DEFAULT_TEMPLATE_LANGUAGE } from "../src/lib/assessments/active-version";
import { computeTemplateContentHash } from "../src/lib/assessments/template-content-hash";
import {
  buildScalingUpQuickSuccessorReportConfig,
  buildSunHubSuccessorReportConfig,
} from "../src/lib/assessments/public-marketing-presets";
import { loadPublicMarketingResultConfig } from "../src/lib/assessments/public-marketing-result";

if (!process.argv.includes("--i-know-this-is-prod")) {
  throw new Error("Refusing to write without --i-know-this-is-prod");
}

const targets = [
  { alias: "scaling-up-quick", preset: "SCALING_UP_QUICK" as const },
  { alias: "sunhub-quick-quiz", preset: "FULL_MARKETING" as const },
];

async function ensureSuccessor({
  alias,
  preset,
}: (typeof targets)[number]) {
  const template = await db.assessmentTemplate.findFirst({
    where: { alias, deletedAt: null },
    select: {
      id: true,
      invitationSubject: true,
      invitationBodyMarkdown: true,
      versions: {
        where: { language: DEFAULT_TEMPLATE_LANGUAGE },
        orderBy: { versionNumber: "desc" },
        select: {
          id: true,
          versionNumber: true,
          publishedAt: true,
          archivedAt: true,
          questions: true,
          sections: true,
          scoringConfig: true,
          reportConfig: true,
        },
      },
    },
  });
  if (!template) throw new Error(`Template ${alias} not found`);

  const existing = template.versions.find((version) => {
    if (version.publishedAt !== null) return false;
    return (
      loadPublicMarketingResultConfig(version.reportConfig)?.marketingCta
        .presetOrigin === preset
    );
  });
  if (existing) {
    return { alias, status: "existing", versionId: existing.id, versionNumber: existing.versionNumber };
  }

  const source = template.versions.find(
    (version) =>
      version.publishedAt !== null &&
      version.archivedAt === activePublishedWhere.archivedAt,
  );
  if (!source) throw new Error(`Template ${alias} has no active published version`);
  const reportConfig =
    preset === "FULL_MARKETING"
      ? buildSunHubSuccessorReportConfig(source.reportConfig)
      : buildScalingUpQuickSuccessorReportConfig(source.reportConfig);
  const contentHash = computeTemplateContentHash({
    questions: source.questions,
    sections: source.sections,
    scoringConfig: source.scoringConfig,
    reportConfig,
    invitationSubject: template.invitationSubject,
    invitationBodyMarkdown: template.invitationBodyMarkdown,
  });
  const versionNumber = Math.max(...template.versions.map((version) => version.versionNumber), 0) + 1;
  const created = await db.assessmentTemplateVersion.create({
    data: {
      templateId: template.id,
      versionNumber,
      language: DEFAULT_TEMPLATE_LANGUAGE,
      questions: source.questions as Prisma.InputJsonValue,
      sections: source.sections as Prisma.InputJsonValue,
      scoringConfig: source.scoringConfig as Prisma.InputJsonValue,
      reportConfig: reportConfig as Prisma.InputJsonValue,
      contentHash,
      publishedAt: null,
      publishedBy: null,
    },
    select: { id: true, versionNumber: true },
  });
  return { alias, status: "created", versionId: created.id, versionNumber: created.versionNumber };
}

async function main() {
  const results = [];
  for (const target of targets) results.push(await ensureSuccessor(target));
  process.stdout.write(`${JSON.stringify({ success: true, results }, null, 2)}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
