/**
 * @file src/lib/auth/options.ts
 * @description NextAuth.js configuration options.
 */

import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import { Tenant } from "@/models";
import { UserRole } from "@/types";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@aidl.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        await connectDB();
        
        const tenant = await Tenant.findOne({ email: credentials.email.toLowerCase() })
          .select("+passwordHash");

        const dummyHash = "$2a$12$dummyhashfortimingprotection00000000000000000";
        const hashToCompare = tenant?.passwordHash ?? dummyHash;
        
        const isPasswordValid = await bcrypt.compare(credentials.password, hashToCompare);

        if (!tenant || !isPasswordValid) {
          throw new Error("Invalid email or password");
        }

        if (!tenant.isActive) {
          throw new Error("Account is deactivated");
        }

        return {
          id: tenant._id.toString(),
          name: tenant.name,
          email: tenant.email,
          role: tenant.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // User object is only passed on initial sign-in
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).userId = token.id;
        (session.user as any).role = token.role;
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
  },
  secret: process.env.NEXTAUTH_SECRET || "your-super-secret-key-for-development",
};
