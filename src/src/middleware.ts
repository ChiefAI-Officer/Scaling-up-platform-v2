import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Role-based access control
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/workshops") || pathname.startsWith("/coaches")) {
      if (!token) {
        return NextResponse.redirect(new URL("/login", req.url));
      }

      // Only ADMIN and STAFF can access dashboard
      if (token.role === "COACH" && !pathname.startsWith("/coaches/profile")) {
        return NextResponse.redirect(new URL("/unauthorized", req.url));
      }
    }

    // API route protection
    if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth") && !pathname.startsWith("/api/public")) {
      // Allow public API endpoints without auth
      if (
        pathname.startsWith("/api/registrations") ||
        pathname.startsWith("/api/webhooks") ||
        pathname.startsWith("/api/health") ||
        pathname.startsWith("/api/docs") ||
        pathname.match(/^\/api\/workshops\/[^/]+\/register$/)
      ) {
        return NextResponse.next();
      }

      if (!token) {
        return NextResponse.json(
          { success: false, error: "Authentication required" },
          { status: 401 }
        );
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;

        // Public routes
        if (
          pathname === "/" ||
          pathname === "/login" ||
          pathname === "/unauthorized" ||
          pathname.startsWith("/workshop/") ||
          pathname.startsWith("/registration/") ||
          pathname.startsWith("/api/auth") ||
          pathname.startsWith("/api/public") ||
          pathname.startsWith("/api/webhooks") ||
          pathname.startsWith("/api/health") ||
          pathname.startsWith("/api/docs") ||
          pathname.startsWith("/api/registrations") ||
          pathname.startsWith("/_next") ||
          pathname.includes(".")
        ) {
          return true;
        }

        // Protected routes require authentication
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
