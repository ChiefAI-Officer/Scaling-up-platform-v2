import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-XSS-Protection", value: "0" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com https://scalingup.idevaffiliate.com https://*.postaffiliatepro.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.vercel-storage.com",
      "connect-src 'self' https://*.stripe.com https://api.hubspot.com https://scalingup.idevaffiliate.com https://*.postaffiliatepro.com https://vercel.com https://*.vercel-storage.com",
      "frame-src https://js.stripe.com",
      "font-src 'self' data:",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    // Summary creation imports the app's Sharp; its OS-loaded libvips library
    // is not discoverable through JavaScript imports alone. Include only the
    // installed root-package native assets, not Next's separate Sharp copy.
    // Next matches route globs with contains:true, covering this report family.
    "/api/assessment-campaigns/*/summary-reports": [
      "./node_modules/@img/sharp-*/lib/*.node",
      "./node_modules/@img/sharp-libvips-*/lib/**/*",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Only the authorized PDF delivery route may be embedded by this app.
        source: "/api/assessment-campaigns/:id/summary-reports/:reportId/artifact",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
  async redirects() {
    return [
      // Assessment Tool Phase A IA refactor — collapse 4 top-level admin
      // sections into a single /admin/assessments lane (wireframe 24).
      // 308 = permanent + method-preserving (so any prefetch / POST in flight
      // is also redirected without method downgrade).
      {
        source: "/admin/assessment-templates",
        destination: "/admin/assessments/templates",
        permanent: true,
      },
      {
        source: "/admin/assessment-templates/new",
        destination: "/admin/assessments/templates/new",
        permanent: true,
      },
      {
        source: "/admin/assessment-templates/:id",
        destination: "/admin/assessments/templates/:id",
        permanent: true,
      },
      {
        source:
          "/admin/assessment-templates/:id/versions/:versionId/edit",
        destination:
          "/admin/assessments/templates/:id/versions/:versionId/edit",
        permanent: true,
      },
      {
        source: "/admin/access-groups",
        destination: "/admin/assessments/access-groups",
        permanent: true,
      },
      {
        source: "/admin/access-groups/:id",
        destination: "/admin/assessments/access-groups/:id",
        permanent: true,
      },
      {
        source: "/admin/observability",
        destination: "/admin/assessments/observability",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
