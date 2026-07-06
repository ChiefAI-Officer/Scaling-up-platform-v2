import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { sendEmailViaSMTP } from "@/lib/smtp-transport";
import {
  runImportAlertSweep,
  type AlertSweepDb,
} from "@/lib/assessments/esperto-import/alert-signals";

/**
 * Wave V (V-2) — Esperto-import alert cron.
 *
 * Every 10 minutes, evaluates the persisted import signals against the
 * runbook 18o §7 conditions (divergent-reimport / unexpected-error /
 * denial burst / commit-latency p95) and emails ADMIN_EMAIL when anything
 * fired. Cursor + checkpoint-before-send live in `runImportAlertSweep`
 * (alert-signals.ts) — this wrapper only wires real deps.
 *
 * Flag-gated INSIDE the sweep (`WAVE_V_IMPORT_ALERTING_ENABLED`, KILL wins):
 * flag off → the tick is a no-op that reads nothing and writes nothing.
 */
export const espertoImportAlertCron = inngest.createFunction(
  { id: "esperto-import-alert-cron" },
  { cron: "*/10 * * * *" },
  async ({ step }) => {
    const outcome = await step.run("alert-sweep", async () => {
      return await runImportAlertSweep({
        db: db as unknown as AlertSweepDb,
        now: new Date(),
        sendEmail: async ({ to, subject, text, html }) => {
          await sendEmailViaSMTP({ to, subject, text, html });
        },
      });
    });
    return outcome;
  },
);

export default espertoImportAlertCron;
