/** @jest-environment node */

import { createRequire } from "node:module";
import { join } from "node:path";
import nextConfig from "../../../next.config";

// Use the same matcher and route options as Next's trace collector. The native
// assets are loaded by the OS, so tracing JavaScript imports alone misses them.
const picomatch = createRequire(join(process.cwd(), "package.json"))(
  "next/dist/compiled/picomatch",
) as (
  pattern: string,
  options?: { dot?: boolean; contains?: boolean },
) => (path: string) => boolean;

function includesAsset(route: string, asset: string): boolean {
  return Object.entries(nextConfig.outputFileTracingIncludes ?? {}).some(
    ([routeGlob, assets]) =>
      picomatch(routeGlob, { dot: true, contains: true })(route) &&
      assets.some((assetGlob) => picomatch(assetGlob)(asset)),
  );
}

describe("summary report native runtime tracing", () => {
  it.each([
    "node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.1.node",
    "node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.3",
    "node_modules/@img/sharp-darwin-arm64/lib/sharp-darwin-arm64-0.35.1.node",
    "node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips-cpp.8.18.3.dylib",
  ])("includes the Sharp native dependency %s in list/create traces", (asset) => {
    expect(
      includesAsset("/api/assessment-campaigns/[id]/summary-reports", asset),
    ).toBe(true);
  });

  it.each([
    "/api/assessment-campaigns/[id]/summary-reports/candidates",
    "/api/assessment-campaigns/[id]/summary-reports/[reportId]/artifact",
  ])("also includes native assets for report-family child %s", (route) => {
    expect(
      includesAsset(
        route,
        "node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.3",
      ),
    ).toBe(true);
  });

  it.each([
    "/api/health",
    "/api/assessment-campaigns/[id]/respondents",
    "/admin/assessments/campaigns/[id]",
  ])("does not add summary-native assets to unrelated route %s", (route) => {
    expect(
      includesAsset(
        route,
        "node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.3",
      ),
    ).toBe(false);
  });
});
