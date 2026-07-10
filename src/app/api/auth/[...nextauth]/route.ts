/**
 * @file src/app/api/auth/[...nextauth]/route.ts
 * @description NextAuth.js API route handler for App Router.
 */

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/options";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
