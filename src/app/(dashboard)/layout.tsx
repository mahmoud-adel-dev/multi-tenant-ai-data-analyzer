/**
 * @file src/app/(dashboard)/layout.tsx
 * @description Tenant dashboard layout — shared by all /dashboard/* pages.
 * Calls requireAuth() — redirects to /login if not authenticated.
 */

import { headers } from "next/headers";
import { requireAuth } from "@/lib/auth/dal";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";

export const metadata = {
  title: { default: "Dashboard", template: "%s | AIDL Platform" },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <DashboardSidebar session={session} activePath={pathname} />
      <main style={{ flex: 1, overflowY: "auto", padding: "32px", maxWidth: "calc(100vw - 240px)" }}>
        {children}
      </main>
    </div>
  );
}
