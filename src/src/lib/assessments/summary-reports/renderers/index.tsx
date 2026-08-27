import { renderToBuffer } from "@react-pdf/renderer";

import type { ScalingCeoFullSnapshot } from "../canonical";
import type { SummaryReportType } from "../types";
import {
  SCALING_CEO_FULL_RENDERER_VERSION,
  ScalingCeoFullDocument,
} from "./scaling-ceo-full-document";

export async function renderSummaryReportPdf(
  reportType: SummaryReportType,
  snapshot: ScalingCeoFullSnapshot,
): Promise<{ bytes: Buffer; rendererVersion: string }> {
  if (reportType !== "SCALING_CEO_FULL") {
    throw new Error(`Unsupported summary report renderer: ${reportType}`);
  }
  if (snapshot.reportType !== reportType) {
    throw new Error(
      `Snapshot report type ${snapshot.reportType} does not match ${reportType}`,
    );
  }

  const bytes = await renderToBuffer(
    <ScalingCeoFullDocument snapshot={snapshot} />,
  );
  return {
    bytes,
    rendererVersion: SCALING_CEO_FULL_RENDERER_VERSION,
  };
}

export { SCALING_CEO_FULL_RENDERER_VERSION };
