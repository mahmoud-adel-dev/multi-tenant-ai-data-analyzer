/**
 * Platform admin layout — gated server-side by requirePlatformAdmin().
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/dal";
import AdminSidebar from "@/components/admin/AdminSidebar";

export const metadata = {
  title: { default: "Platform Admin", template: "%s | AIDL Admin" },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin().catch(() => null);
  if (!admin) redirect("/login");

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <AdminSidebar userName={admin.name} activePath={pathname} />
      <main style={{ flex: 1, overflowY: "auto", padding: "32px", minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
