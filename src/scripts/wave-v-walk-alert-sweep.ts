/**
 * Wave V launch walk — V-2 alert-sweep pilot against the prod DB.
 *
 * 1. Inserts ONE clearly-synthetic `divergent-reimport` conflict signal row
 *    (walk org, templateAlias "wave-v-walk-synthetic") — PII-free.
 * 2. Runs the REAL `runImportAlertSweep` with the flag inline and
 *    ADMIN_EMAIL overridden to the walk recipient (env, set by the caller —
 *    NEVER the real admin inbox), sending via the real smtp-transport.
 * 3. Prints the outcome + the checkpoint row it wrote.
 *
 * The checkpoint this writes protects the future prod cron: its first tick
 * resumes AFTER this walk's processedThrough, so the synthetic row can never
 * re-alert.
 *
 * Usage:
 *   WAVE_V_IMPORT_ALERTING_ENABLED=1 ADMIN_EMAIL=<walk recipient> \
 *     npx tsx scripts/wave-v-walk-alert-sweep.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  ALERT_SIGNAL_ENTITY_TYPE,
  ALERT_CRON_ENTITY_TYPE,
  COMMIT_CONFLICT_ACTION,
  runImportAlertSweep,
  type AlertSweepDb,
} from "../src/lib/assessments/esperto-import/alert-signals";
import { sendEmailViaSMTP } from "../src/lib/smtp-transport";

const db = new PrismaClient();

async function main() {
  if (!process.env.ADMIN_EMAIL) {
    throw new Error("Set ADMIN_EMAIL to the WALK recipient before running.");
  }
  console.log("walk recipient:", process.env.ADMIN_EMAIL);

  const signal = await db.auditLog.create({
    data: {
      entityType: ALERT_SIGNAL_ENTITY_TYPE,
      entityId: "cmpb9nqj30001a07xey1bwwmy", // walk "Test" org
      action: COMMIT_CONFLICT_ACTION,
      performedBy: "SYSTEM",
      changes: JSON.stringify({
        errorCode: "divergent-reimport",
        organizationId: "cmpb9nqj30001a07xey1bwwmy",
        templateAlias: "wave-v-walk-synthetic",
      }),
    },
  });
  console.log("synthetic signal row:", signal.id);

  const outcome = await runImportAlertSweep({
    db: db as unknown as AlertSweepDb,
    now: new Date(),
    sendEmail: async ({ to, subject, text, html }) => {
      await sendEmailViaSMTP({ to, subject, text, html });
    },
  });
  console.log("sweep outcome:", JSON.stringify(outcome, null, 2));

  const checkpoint = await db.auditLog.findFirst({
    where: { entityType: ALERT_CRON_ENTITY_TYPE, action: "run" },
    orderBy: { timestamp: "desc" },
  });
  console.log(
    "checkpoint row:",
    checkpoint ? `${checkpoint.id} ${checkpoint.changes}` : "MISSING",
  );

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
