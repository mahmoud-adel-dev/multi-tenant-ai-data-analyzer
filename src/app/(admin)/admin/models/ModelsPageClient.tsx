"use client";

/**
 * @file src/app/(admin)/admin/models/ModelsPageClient.tsx
 * @description Client-side shell for the AI Models page.
 * Manages the modal open/close state and toast notifications.
 * The data itself is fetched SSR in page.tsx and passed as a prop.
 */

import { useState } from "react";
import { AiModelConfigDTO } from "@/types";
import ModelCard from "@/components/admin/ModelCard";
import ModelConfigForm from "@/components/admin/ModelConfigForm";

interface ModelsPageClientProps {
  initialConfigs: AiModelConfigDTO[];
}

export default function ModelsPageClient({ initialConfigs }: ModelsPageClientProps) {
  const [configs, setConfigs] = useState<AiModelConfigDTO[]>(initialConfigs);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AiModelConfigDTO | undefined>();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  /** Show a temporary toast notification. */
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const openCreateModal = () => {
    setEditingConfig(undefined);
    setModalOpen(true);
  };

  const openEditModal = (config: AiModelConfigDTO) => {
    setEditingConfig(config);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingConfig(undefined);
  };

  const handleFormSuccess = (msg: string) => {
    closeModal();
    showToast(msg);
    // The page will re-render via revalidatePath on next navigation.
    // For immediate UI update, we just close the modal and show toast.
    // A full refresh gets the updated list from the server.
    window.location.reload();
  };

  const handleCardUpdate = (msg: string) => {
    showToast(msg);
    setTimeout(() => window.location.reload(), 800);
  };

  const activeCount = configs.filter((c) => c.isActive).length;

  return (
    <div>
      {/* ── Page Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "32px",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "26px",
              fontWeight: 800,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
              marginBottom: "6px",
            }}
          >
            AI Model Configurations
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            Manage and switch between AI model integrations.{" "}
            <span style={{ color: "var(--accent-primary)", fontWeight: 600 }}>
              {configs.length} configured
            </span>
            {activeCount > 0 && (
              <span style={{ color: "var(--text-muted)" }}>
                {" · "}1 active
              </span>
            )}
          </p>
        </div>

        <button
          onClick={openCreateModal}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 20px",
            borderRadius: "10px",
            background: "var(--brand-gradient)",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 16px var(--accent-glow)",
            transition: "transform 0.2s, box-shadow 0.2s",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Model
        </button>
      </div>

      {/* ── Stats Bar ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "14px",
          marginBottom: "32px",
        }}
      >
        {[
          { label: "Total Configs",   value: configs.length,                             color: "var(--accent-primary)" },
          { label: "Active Model",    value: activeCount ? "1" : "None",                 color: "#10b981" },
          { label: "Cloud Models",    value: configs.filter(c => c.providerType === "cloud").length, color: "#6366f1" },
          { label: "Local Models",    value: configs.filter(c => c.providerType === "local").length, color: "#8b5cf6" },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: "16px",
              borderRadius: "10px",
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-card)",
            }}
          >
            <div style={{ fontSize: "22px", fontWeight: 800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "3px" }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* ── Cards Grid ── */}
      {configs.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "80px 24px",
            borderRadius: "16px",
            border: "2px dashed var(--border-color)",
            background: "var(--bg-card)",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🤖</div>
          <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
            No AI Models Configured
          </h3>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>
            Add your first AI model to start processing data.
          </p>
          <button
            onClick={openCreateModal}
            style={{
              padding: "10px 24px",
              borderRadius: "8px",
              background: "var(--brand-gradient)",
              color: "#fff",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Add Your First Model
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "20px" }}>
          {configs.map((config) => (
            <ModelCard
              key={config.id}
              config={config}
              onEdit={openEditModal}
              onUpdate={handleCardUpdate}
            />
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          {/* Backdrop */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(6px)",
            }}
          />

          {/* Modal Panel */}
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: "560px",
              maxHeight: "90vh",
              overflowY: "auto",
              borderRadius: "16px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              padding: "28px",
              boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)" }}>
                {editingConfig ? "Edit Model Configuration" : "Add New AI Model"}
              </h2>
              <button
                onClick={closeModal}
                style={{
                  width: "32px", height: "32px", borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>

            <ModelConfigForm
              existing={editingConfig}
              onSuccess={handleFormSuccess}
              onCancel={closeModal}
            />
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 200,
            padding: "14px 20px",
            borderRadius: "10px",
            background: toast.type === "success" ? "#10b981" : "#ef4444",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 600,
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            animation: "fadeInUp 0.3s ease",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
