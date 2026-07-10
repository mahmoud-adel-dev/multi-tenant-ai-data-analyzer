/**
 * @file src/app/(admin)/layout.tsx
 * @description Admin section layout. Shared by all pages under (admin)/ route group.
 *
 * SECURITY: Calls `requireSuperAdmin()` on every render.
 * Any non-super-admin user is redirected before any admin content renders.
 *
 * STRUCTURE:
 *   ┌──────────┬──────────────────────────┐
 *   │ Sidebar  │         {children}        │
 *   │ (240px)  │   (scrollable content)    │
 *   └──────────┴──────────────────────────┘
 */

import { headers } from "next/headers";
import { requireSuperAdmin } from "@/lib/auth/dal";
import AdminSidebar from "@/components/admin/AdminSidebar";

export const metadata = {
  title: { default: "Admin Dashboard", template: "%s | AIDL Admin" },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireSuperAdmin() redirects if not authenticated or not a super admin.
  const session = await requireSuperAdmin();

  // Get the current pathname to highlight the active sidebar link.
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg-primary)",
      }}
    >
      <AdminSidebar session={session} activePath={pathname} />

      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px",
          maxWidth: "calc(100vw - 240px)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
