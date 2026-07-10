/**
 * @file src/lib/auth/dal.ts
 * @description Data Access Layer for retrieving the current NextAuth session.
 */

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/options";
import { redirect } from "next/navigation";
import { UserRole } from "@/types";

/**
 * Returns the current authenticated NextAuth session payload.
 * If the user is not authenticated, redirects to /login.
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    redirect("/login");
  }

  // Type assertion based on our next-auth callbacks
  const user = session.user as any;

  return {
    userId: user.userId as string,
    email: user.email as string,
    name: user.name as string,
    role: user.role as UserRole,
  };
}

/**
 * Ensures the user has at least TENANT_ADMIN privileges.
 * Returns the session payload if authorized.
 */
export async function requireTenantAdmin() {
  const session = await requireAuth();
  // In our system, both TENANT_ADMIN and SUPER_ADMIN can access tenant routes
  if (session.role !== UserRole.TENANT_ADMIN && session.role !== UserRole.SUPER_ADMIN) {
    // Redirect instead of throwing a hard error
    redirect("/login?error=unauthorized");
  }
  return session;
}

/**
 * Ensures the user is a SUPER_ADMIN.
 * Redirects to the dashboard if not.
 */
export async function requireSuperAdmin() {
  const session = await requireAuth();
  
  if (session.role !== UserRole.SUPER_ADMIN) {
    redirect("/dashboard/api-keys");
  }

  return session;
}
