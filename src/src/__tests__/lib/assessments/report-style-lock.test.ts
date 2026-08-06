import { lockReportStyleForFirstCompletion } from "@/lib/assessments/report-style-lock";

type RawCall = [TemplateStringsArray, ...unknown[]];

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

describe("lockReportStyleForFirstCompletion", () => {
  it("awaits the campaign lock before creating the simulated submission and parameterizes its COALESCE update", async () => {
    // This fails if the lock primitive stops awaiting $executeRaw, sends the
    // campaign id or timestamp as SQL text, omits COALESCE, or lets a caller's
    // submission create run before the database has accepted the lock update.
    const rawFinished = deferred<void>();
    const events: string[] = [];
    const tx = {
      $executeRaw: jest.fn(() => {
        events.push("lock started");
        return rawFinished.promise.then(() => {
          events.push("lock finished");
          return 1;
        });
      }),
    };
    const createSubmission = jest.fn(async () => {
      events.push("submission created");
    });
    const campaignId = "campaign-safe-value";
    const submittedAt = new Date("2026-08-05T06:30:00.000Z");

    const successfulSubmission = (async () => {
      await lockReportStyleForFirstCompletion(tx, campaignId, submittedAt);
      await createSubmission();
    })();

    await Promise.resolve();
    expect(createSubmission).not.toHaveBeenCalled();
    expect(events).toEqual(["lock started"]);

    rawFinished.resolve();
    await successfulSubmission;

    expect(events).toEqual([
      "lock started",
      "lock finished",
      "submission created",
    ]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = (tx.$executeRaw as jest.Mock).mock.calls[0] as RawCall;
    expect(strings.join("?")).toBe(
      '\n    UPDATE "assessment_campaigns"\n    SET "reportStyleLockedAt" = COALESCE("reportStyleLockedAt", ?)\n    WHERE "id" = ?\n  ',
    );
    expect(values).toEqual([submittedAt, campaignId]);
  });
});
