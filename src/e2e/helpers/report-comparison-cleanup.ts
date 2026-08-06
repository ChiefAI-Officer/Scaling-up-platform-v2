export type ReportComparisonCleanupTask = {
  name: string;
  run: () => Promise<void>;
};

type ReportComparisonCleanupOptions<T> = {
  run: () => Promise<T>;
  cleanup: ReportComparisonCleanupTask[];
  onCleanupFailure?: (failure: AggregateError) => void;
};

export async function runWithReportComparisonCleanup<T>({
  run,
  cleanup,
  onCleanupFailure,
}: ReportComparisonCleanupOptions<T>): Promise<T> {
  let result: T | undefined;
  let bodyFailed = false;
  let primaryFailure: unknown;

  try {
    result = await run();
  } catch (error) {
    bodyFailed = true;
    primaryFailure = error;
  }

  const cleanupFailures: Array<{ name: string; error: unknown }> = [];
  for (const task of cleanup) {
    try {
      await task.run();
    } catch (error) {
      cleanupFailures.push({ name: task.name, error });
    }
  }

  if (bodyFailed) {
    if (cleanupFailures.length > 0) {
      const failure = new AggregateError(
        cleanupFailures.map(({ error }) => error),
        `Report-comparison E2E cleanup failed: ${cleanupFailures.map(({ name }) => name).join(", ")}.`,
      );
      try {
        onCleanupFailure?.(failure);
      } catch {
        // Diagnostics must not replace the test body's primary failure.
      }
    }
    throw primaryFailure;
  }

  if (cleanupFailures.length > 0) {
    throw new AggregateError(
      cleanupFailures.map(({ error }) => error),
      `Report-comparison E2E cleanup failed: ${cleanupFailures.map(({ name }) => name).join(", ")}.`,
    );
  }

  return result as T;
}
