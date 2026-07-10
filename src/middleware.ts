/**
 * @file src/middleware.ts
 * @description NextAuth.js Middleware for route protection.
 */

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // If no token, let the authorized callback or Next.js handle it
    if (!token) {
      return NextResponse.next();
    }

    const role = token.role as string;

    // Protect Super Admin routes
    if (pathname.startsWith("/admin") && role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/dashboard/api-keys", req.url));
    }

    // Redirect authenticated users away from /login and /register
    if (pathname === "/login" || pathname === "/register") {
      if (role === "SUPER_ADMIN") {
        return NextResponse.redirect(new URL("/admin/models", req.url));
      }
      return NextResponse.redirect(new URL("/dashboard/api-keys", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        // Only require authentication for /dashboard and /admin routes
        const { pathname } = req.nextUrl;
        if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) {
          return !!token;
        }
        return true; // Allow public routes
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

// Matcher defines which routes this middleware applies to.
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
