/**
 * NextAuth.js configuration.
 *
 * Hardening:
 * - Fail-fast secret from validated env (no fallbacks).
 * - Session JWT carries only identity claims; authorization is ALWAYS
 *   re-verified against the database server-side (see lib/auth/dal.ts), so a
 *   stale role in an old token can never grant access.
 * - Secure cookies in production, SameSite=Lax, bounded session lifetime.
 */
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import { User } from "@/models";
import { UserRole } from "@/types";
import { getEnv } from "@/lib/env";
import { writeAudit } from "@/models";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }
        await connectDB();

        const user = await User.findOne({ email: credentials.email.toLowerCase() }).select("+passwordHash");

        // Constant-time-ish path: always run one bcrypt compare.
        const dummyHash = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpQqXQhLScPCLxrWlmS1fUoGXvN4a";
        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user?.passwordHash ?? dummyHash
        );

        if (!user || !isPasswordValid) {
          await writeAudit({
            actorUserId: user?._id?.toString() ?? null,
            action: "auth.login_failed",
            resourceType: "user",
            metadata: { email: credentials.email.toLowerCase() },
          });
          return null;
        }

        if (!user.isActive) {
          return null;
        }

        user.lastLoginAt = new Date();
        await user.save();

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role as UserRole,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.userId = token.id as string;
        session.user.role = token.role as UserRole;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days absolute.
    updateAge: 24 * 60 * 60,
  },
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: getEnv().isProd,
      },
    },
  },
  secret: getEnv().NEXTAUTH_SECRET,
};
