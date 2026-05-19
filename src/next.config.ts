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
      "connect-src 'self' https://*.stripe.com https://api.hubspot.com https://scalingup.idevaffiliate.com https://*.postaffiliatepro.com",
      "frame-src https://js.stripe.com",
      "font-src 'self' data:",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
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
