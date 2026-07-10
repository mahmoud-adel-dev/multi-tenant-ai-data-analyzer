/**
 * @file src/app/layout.tsx
 * @description The root layout. Wraps every page in the application.
 * This is a React Server Component (no "use client").
 */

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AIDL Platform — Multi-Tenant AI Data Analysis",
    template: "%s | AIDL Platform",
  },
  description:
    "Enterprise-grade, multi-tenant SaaS for AI-powered data extraction and analysis from Excel, JSON, PDFs, and invoice images.",
  keywords: ["AI", "data analysis", "SaaS", "multi-tenant", "OCR", "invoice"],
};

/**
 * RootLayout wraps the entire application.
 * Font configuration, global styles, and providers are mounted here.
 */
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "react-hot-toast";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
          {children}
          <Toaster position="bottom-right" toastOptions={{ style: { background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border-color)", borderRadius: "12px", boxShadow: "var(--card-shadow)", fontSize: "14px" } }} />
        </ThemeProvider>
      </body>
    </html>
  );
}
