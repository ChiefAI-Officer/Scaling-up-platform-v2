import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import {
  enforceGlobalApiRateLimit,
  getRequestIdentifierFromHeaders,
} from "@/lib/global-rate-limit";
import { isReportComparisonRolloutActive } from "@/lib/assessments/wave-report-comparison-flags";

// R2-LOW-1: the branded results report pages render named PII (scores, answers).
// Report routes render named PII and must never be cached. Keep the group and
// individual patterns separate: CEO self-access intentionally opens only the
// individual path, never the campaign-level group report.
export const GROUP_REPORT_NO_STORE_REGEX = /^\/assessments\/[^/]+\/report\/?$/;
export const CONDENSED_REPORT_NO_STORE_REGEX =
  /^\/assessments\/[^/]+\/report\/condensed\/?$/;
export const RESPONDENT_REPORT_REGEX =
  /^\/assessments\/[^/]+\/respondents\/[^/]+\/report\/?$/;
export const SELF_COMPARISON_REPORT_REGEX =
  /^\/assessments\/[^/]+\/self-comparison\/?$/;
export const PUBLIC_REFERRAL_REPORT_NO_STORE_REGEX =
  /^\/assessments\/public-submissions\/[^/]+\/report\/?$/;
const CEO_SELF_REPORT_PATH = "/assessments/self-report";
const CEO_SELF_REPORT_EXCHANGE_PATH = "/assessments/self-report/exchange";
const BLOB_CLIENT_UPLOAD_CALLBACK_PATH = "/api/files/client-upload";

function withRateLimitHeaders(
  response: NextResponse,
  headers?: Record<string, string>
): NextResponse {
  if (!headers) {
    return response;
  }

  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }

  return response;
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;
    let rateLimitHeaders: Record<string, string> | undefined;

    // P0-SEC-04: Global middleware rate limiting for sensitive API classes.
    if (pathname.startsWith("/api/")) {
      const rateLimit = enforceGlobalApiRateLimit({
        pathname,
        method: req.method,
        identifier: getRequestIdentifierFromHeaders(req.headers),
      });

      if (rateLimit.enforced) {
        rateLimitHeaders = rateLimit.headers;
      }

      if (rateLimit.enforced && !rateLimit.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: "Too many requests. Please try again shortly.",
            code: "RATE_LIMITED",
          },
          { status: 429, headers: rateLimit.headers }
        );
      }
    }

    // Role-based access control
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/workshops") || pathname.startsWith("/coaches")) {
      if (!token) {
        return withRateLimitHeaders(
          NextResponse.redirect(new URL("/login", req.url)),
          rateLimitHeaders
        );
      }

      // Only ADMIN and STAFF can access dashboard
      if (token.role === "COACH" && !pathname.startsWith("/coaches/profile")) {
        return withRateLimitHeaders(
          NextResponse.redirect(new URL("/unauthorized", req.url)),
          rateLimitHeaders
        );
      }
    }

    // API route protection
    if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth") && !pathname.startsWith("/api/public")) {
      // Allow public API endpoints without auth
      if (
        (pathname.startsWith("/api/registrations") && !pathname.startsWith("/api/registrations/export")) ||
        pathname.startsWith("/api/checkout") ||
        pathname.startsWith("/api/webhooks") ||
        pathname.startsWith("/api/inngest") ||
        pathname.startsWith("/api/health") ||
        pathname.startsWith("/api/docs") ||
        // Vercel Blob signs completion callbacks; the route itself still
        // requires an authenticated actor before issuing client upload tokens.
        pathname === BLOB_CLIENT_UPLOAD_CALLBACK_PATH ||
        pathname.match(/^\/api\/workshops\/[^/]+\/register$/) ||
        // Survey fetch and submit are public (survey links in workflow emails must work unauthenticated)
        // Negative lookahead excludes /api/surveys/assign and /api/surveys/workflows (stay protected)
        pathname.match(/^\/api\/surveys\/(?!assign|workflows)[^/]+(\/submit)?$/) ||
        // Assessment v7.6 — INVITED-mode survey page + cookie routes (Task D)
        pathname.startsWith("/org-survey/") ||
        // Assessment v7.6 — PUBLIC-mode quiz page + submit route
        pathname.startsWith("/quiz/") ||
        pathname.startsWith("/api/quiz/")
      ) {
        return withRateLimitHeaders(NextResponse.next(), rateLimitHeaders);
      }

      if (!token) {
        return withRateLimitHeaders(
          NextResponse.json(
            { success: false, error: "Authentication required" },
            { status: 401 }
          ),
          rateLimitHeaders
        );
      }
    }

    // CEO self exchange + individual report are capability-protected surfaces.
    // Neither response may be cached or used as a referrer; group behavior stays
    // unchanged because only the exact respondent-report regex is public.
    const passthrough = NextResponse.next();
    if (
      pathname === CEO_SELF_REPORT_PATH ||
      pathname === CEO_SELF_REPORT_EXCHANGE_PATH ||
      RESPONDENT_REPORT_REGEX.test(pathname) ||
      SELF_COMPARISON_REPORT_REGEX.test(pathname)
    ) {
      passthrough.headers.set("Cache-Control", "no-store, private");
      passthrough.headers.set("Referrer-Policy", "no-referrer");
    } else if (
      GROUP_REPORT_NO_STORE_REGEX.test(pathname) ||
      CONDENSED_REPORT_NO_STORE_REGEX.test(pathname) ||
      PUBLIC_REFERRAL_REPORT_NO_STORE_REGEX.test(pathname)
    ) {
      passthrough.headers.set("Cache-Control", "no-store, private");
    }
    return withRateLimitHeaders(passthrough, rateLimitHeaders);
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;

        // Public routes — no authentication required
        if (
          pathname === "/" ||
          pathname === "/login" ||
          pathname === "/register" ||
          pathname === "/forgot-password" ||
          pathname === "/reset-password" ||
          pathname === "/unauthorized" ||
          pathname.startsWith("/workshop/") ||
          pathname.startsWith("/registration/") ||
          pathname.startsWith("/api/auth") ||
          pathname.startsWith("/api/public") ||
          pathname.startsWith("/api/webhooks") ||
          pathname.startsWith("/api/inngest") ||
          pathname.startsWith("/api/health") ||
          pathname.startsWith("/api/docs") ||
          pathname === BLOB_CLIENT_UPLOAD_CALLBACK_PATH ||
          (pathname.startsWith("/api/registrations") && !pathname.startsWith("/api/registrations/export")) ||
          pathname.startsWith("/api/checkout") ||
          pathname.match(/^\/api\/workshops\/[^/]+\/register$/) ||
          pathname.startsWith("/survey/") ||
          pathname.match(/^\/api\/surveys\/(?!assign|workflows)[^/]+(\/submit)?$/) ||
          // Assessment v7.6 — INVITED-mode survey page + cookie routes (Task D)
          pathname.startsWith("/org-survey/") ||
          pathname.startsWith("/quiz/") ||
          pathname.startsWith("/api/quiz/") ||
          (
            isReportComparisonRolloutActive() &&
            (
              pathname === CEO_SELF_REPORT_PATH ||
              pathname === CEO_SELF_REPORT_EXCHANGE_PATH ||
              RESPONDENT_REPORT_REGEX.test(pathname)
            )
          ) ||
          pathname.startsWith("/wireframes") ||
          pathname.startsWith("/_next") ||
          pathname.includes(".")
        ) {
          return true;
        }

        // All other routes (including protected API routes) require authentication
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
