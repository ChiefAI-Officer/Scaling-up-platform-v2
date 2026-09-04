import nextConfig from "../../../next.config";
import vercelConfig from "../../../vercel.json";

function expectBlobConnectSources(csp: string | undefined) {
  const connectSource = csp
    ?.split("; ")
    .find((directive) => directive.startsWith("connect-src "));

  expect(connectSource?.split(" ")).toContain("https://vercel.com");
  expect(connectSource?.split(" ")).toContain(
    "https://*.vercel-storage.com",
  );
}

describe("security headers", () => {
  it("allows Vercel Blob connections in Next's report-only policy", async () => {
    const routes = await nextConfig.headers!();
    const globalRoute = routes.find((route) => route.source === "/:path*");
    const csp = globalRoute?.headers.find(
      (header) => header.key === "Content-Security-Policy-Report-Only",
    )?.value;

    expectBlobConnectSources(csp);
  });

  it("allows Vercel Blob connections in the enforced deployment policy", () => {
    const globalRoute = vercelConfig.headers.find(
      (route) => route.source === "/(.*)",
    );
    const csp = globalRoute?.headers.find(
      (header) => header.key === "Content-Security-Policy",
    )?.value;

    expectBlobConnectSources(csp);
  });
});
