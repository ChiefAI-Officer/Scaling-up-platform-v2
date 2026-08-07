import { runWithReportComparisonCleanup } from "../../../e2e/helpers/report-comparison-cleanup";

describe("report-comparison E2E cleanup", () => {
  it("attempts every restoration and context close when an earlier restoration fails", async () => {
    const events: string[] = [];

    await expect(
      runWithReportComparisonCleanup({
        run: async () => {
          events.push("body");
        },
        cleanup: [
          {
            name: "restore campaign",
            run: async () => {
              events.push("restore campaign");
              throw new Error("campaign restore failed");
            },
          },
          {
            name: "restore CEO",
            run: async () => {
              events.push("restore CEO");
            },
          },
          {
            name: "close non-CEO context",
            run: async () => {
              events.push("close non-CEO context");
            },
          },
          {
            name: "close CEO context",
            run: async () => {
              events.push("close CEO context");
            },
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: "AggregateError",
      errors: [expect.objectContaining({ message: "campaign restore failed" })],
    });

    expect(events).toEqual([
      "body",
      "restore campaign",
      "restore CEO",
      "close non-CEO context",
      "close CEO context",
    ]);
  });

  it("surfaces cleanup failure when the test body succeeds", async () => {
    const cleanupFailure = new Error("context close failed");

    await expect(
      runWithReportComparisonCleanup({
        run: async () => undefined,
        cleanup: [
          {
            name: "close CEO context",
            run: async () => {
              throw cleanupFailure;
            },
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: "AggregateError",
      errors: [cleanupFailure],
    });
  });

  it("preserves the primary test failure while reporting cleanup diagnostics", async () => {
    const primaryFailure = new Error("report assertion failed");
    const cleanupFailure = new Error("restore CEO failed");
    const diagnostics: unknown[] = [];
    const events: string[] = [];

    await expect(
      runWithReportComparisonCleanup({
        run: async () => {
          events.push("body");
          throw primaryFailure;
        },
        cleanup: [
          {
            name: "restore campaign",
            run: async () => {
              events.push("restore campaign");
            },
          },
          {
            name: "restore CEO",
            run: async () => {
              events.push("restore CEO");
              throw cleanupFailure;
            },
          },
          {
            name: "close CEO context",
            run: async () => {
              events.push("close CEO context");
            },
          },
        ],
        onCleanupFailure: (failure) => diagnostics.push(failure),
      }),
    ).rejects.toBe(primaryFailure);

    expect(events).toEqual([
      "body",
      "restore campaign",
      "restore CEO",
      "close CEO context",
    ]);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        name: "AggregateError",
        errors: [cleanupFailure],
      }),
    ]);
  });
});
