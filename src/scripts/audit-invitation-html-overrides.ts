import { PrismaClient } from "@prisma/client";

import {
  buildInvitationHtmlOverrideAudit,
  formatInvitationHtmlOverrideAudit,
  loadInvitationHtmlOverrideRows,
  type InvitationHtmlAuditDb,
} from "../src/lib/assessments/invitation-html-override-audit";
import {
  assessmentInviteBrandedCustomHtmlEnabled,
  waveDCustomHtmlEmailEnabled,
} from "../src/lib/assessments/wave-d-feature-flags";

const MISSING_READONLY_URL_MESSAGE =
  "AUDIT_READONLY_URL is required; DATABASE_URL and DIRECT_URL are not accepted.";

async function main(): Promise<void> {
  const readonlyUrl = process.env.AUDIT_READONLY_URL;
  if (!readonlyUrl?.trim()) {
    throw new Error(MISSING_READONLY_URL_MESSAGE);
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: readonlyUrl } },
  });

  try {
    const auditRows = await loadInvitationHtmlOverrideRows(
      prisma as unknown as InvitationHtmlAuditDb,
    );
    const report = buildInvitationHtmlOverrideAudit({
      rows: auditRows,
      currentWaveDEnabled: waveDCustomHtmlEmailEnabled(),
      currentBrandedModeEnabled:
        assessmentInviteBrandedCustomHtmlEnabled(),
    });

    console.log(formatInvitationHtmlOverrideAudit(report));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.message === MISSING_READONLY_URL_MESSAGE
      ? MISSING_READONLY_URL_MESSAGE
      : "Invitation HTML override audit failed.",
  );
  process.exitCode = 1;
});
