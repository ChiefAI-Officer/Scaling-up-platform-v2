import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import {
  enforceGlobalApiRateLimit,
  getRequestIdentifierFromHeaders,
} from "@/lib/global-rate-limit";

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
        pathname.match(/^\/api\/workshops\/[^/]+\/register$/) ||
        // Survey fetch and submit are public (survey links in workflow emails must work unauthenticated)
        // Negative lookahead excludes /api/surveys/assign and /api/surveys/workflows (stay protected)
        pathname.match(/^\/api\/surveys\/(?!assign|workflows)[^/]+(\/submit)?$/)
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

    return withRateLimitHeaders(NextResponse.next(), rateLimitHeaders);
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
          (pathname.startsWith("/api/registrations") && !pathname.startsWith("/api/registrations/export")) ||
          pathname.startsWith("/api/checkout") ||
          pathname.match(/^\/api\/workshops\/[^/]+\/register$/) ||
          pathname.startsWith("/survey/") ||
          pathname.match(/^\/api\/surveys\/(?!assign|workflows)[^/]+(\/submit)?$/) ||
          pathname.startsWith("/wireframes/") ||
          pathname.startsWith("/wireframes-phase2/") ||
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
