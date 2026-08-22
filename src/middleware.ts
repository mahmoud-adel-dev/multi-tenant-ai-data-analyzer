/**
 * Route protection middleware.
 *
 * SECURITY MODEL: middleware only gates on session-token presence for UX
 * routing. Real authorization is ALWAYS enforced server-side in
 * lib/auth/dal.ts (fresh DB lookups of user status + org membership + role),
 * so a stale or forged JWT can never grant access to data.
 */
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // Authenticated users skip auth pages.
    if ((pathname === "/login" || pathname === "/register") && token) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    secret: process.env.NEXTAUTH_SECRET,
    cookies: {
      sessionToken: {
        name: SESSION_COOKIE_NAME,
      },
    },
    callbacks: {
      authorized: ({ req, token }) => {
        const { pathname } = req.nextUrl;
        if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
          return !!token;
        }
        return true;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
