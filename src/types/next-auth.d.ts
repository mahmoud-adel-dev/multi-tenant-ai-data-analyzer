/**
 * NextAuth session type augmentation — typed identity claims on the session.
 */
import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/types";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      userId: string;
      role: UserRole;
    };
  }

  interface User {
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
  }
}

export {};
