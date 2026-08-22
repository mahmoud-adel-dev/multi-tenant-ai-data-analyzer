/**
 * Tenant dashboard layout — shared by all /dashboard/* pages.
 * requireOrg() enforces authentication + verified org membership server-side.
 * LocaleProvider supplies EN/AR dictionaries and real RTL switching.
 */
import { headers } from "next/headers";
import { requireOrg } from "@/lib/auth/dal";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";

export const metadata = {
  title: { default: "Dashboard", template: "%s | AIDL Platform" },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let ctx;
  try {
    ctx = await requireOrg();
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") {
      redirect("/login?error=unauthorized");
    }
    throw error;
  }

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  return (
    <LocaleProvider>
      <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
        <DashboardSidebar
          userName={ctx.name}
          userEmail={ctx.email}
          org={{ name: ctx.orgName, planKey: ctx.planKey, role: ctx.role }}
          activePath={pathname}
        />
        <main style={{ flex: 1, overflowY: "auto", padding: "32px", minWidth: 0 }} className="dashboard-main">
          {children}
        </main>
      </div>
    </LocaleProvider>
  );
}
