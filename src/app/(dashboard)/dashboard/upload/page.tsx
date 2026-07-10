import { Metadata } from "next";
import { requireTenantAdmin } from "@/lib/auth/dal";
import UploadClient from "./UploadClient";
import { getActiveModels } from "@/actions/models";

export const metadata: Metadata = {
  title: "Upload Data | AIDL Platform",
  description: "Upload your files and generate AI reports.",
};

export default async function UploadPage() {
  await requireTenantAdmin();
  const modelsResult = await getActiveModels();
  const models = modelsResult.success ? modelsResult.data : [];

  return (
    <main style={{ padding: "32px", maxWidth: "800px", margin: "0 auto" }}>
      <header style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "8px" }}>AI Data Analyzer</h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Upload your Excel sheet, write your prompt, and let the AI generate a detailed report.</p>
      </header>

      <UploadClient initialModels={models} />
    </main>
  );
}
