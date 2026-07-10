"use client";

/**
 * @file src/components/admin/ModelCard.tsx
 * @description Displays a single AI Model Config card with actions.
 * "use client" — needed for delete confirmation and setActive button interactions.
 */

import { useState, useTransition } from "react";
import { AiModelConfigDTO, ModelProviderType } from "@/types";
import { deleteAiModelConfig, setActiveAiModel } from "@/actions/ai-models";

interface ModelCardProps {
  config: AiModelConfigDTO;
  onEdit: (config: AiModelConfigDTO) => void;
  onUpdate: (message: string) => void;
}

export default function ModelCard({ config, onEdit, onUpdate }: ModelCardProps) {
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSetActive = () => {
    startTransition(async () => {
      const result = await setActiveAiModel(config.id);
      if (result.success) {
        onUpdate(result.message ?? "Model activated.");
      }
    });
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000); // Auto-cancel after 3s.
      return;
    }
    startTransition(async () => {
      const result = await deleteAiModelConfig(config.id);
      if (!result.success) {
        onUpdate(`Error: ${result.error}`);
      } else {
        onUpdate(result.message ?? "Deleted.");
      }
      setConfirmDelete(false);
    });
  };

  const isLocal = config.providerType === ModelProviderType.LOCAL;

  return (
    <div
      style={{
        padding: "20px",
        borderRadius: "12px",
        border: config.isActive
          ? "1.5px solid var(--accent-primary)"
          : "1px solid var(--border-color)",
        background: config.isActive ? "var(--accent-light)" : "var(--bg-card)",
        boxShadow: config.isActive ? "0 0 24px var(--accent-glow)" : "var(--card-shadow)",
        transition: "all 0.3s ease",
        position: "relative",
        opacity: isPending ? 0.6 : 1,
      }}
    >
      {/* Active Badge */}
      {config.isActive && (
        <div
          style={{
            position: "absolute",
            top: "-10px",
            right: "16px",
            padding: "3px 10px",
            borderRadius: "100px",
            background: "var(--brand-gradient)",
            color: "#fff",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.05em",
          }}
        >
          ● ACTIVE
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "14px" }}>
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
            {config.name}
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {/* Provider Type Badge */}
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "6px",
                background: isLocal ? "#8b5cf620" : "#6366f120",
                color: isLocal ? "#8b5cf6" : "#6366f1",
                border: `1px solid ${isLocal ? "#8b5cf630" : "#6366f130"}`,
              }}
            >
              {isLocal ? "🖥️ Local" : "☁️ Cloud"}
            </span>
            {/* Model Identifier */}
            <span style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--text-muted)", background: "var(--bg-secondary)", padding: "2px 8px", borderRadius: "6px" }}>
              {config.modelIdentifier}
            </span>
          </div>
        </div>
      </div>

      {/* Base URL */}
      <div style={{ marginBottom: "12px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Endpoint
        </span>
        <p style={{ fontSize: "13px", fontFamily: "monospace", color: "var(--text-secondary)", marginTop: "3px", wordBreak: "break-all" }}>
          {config.baseUrl}
        </p>
      </div>

      {/* Description */}
      {config.description && (
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px", lineHeight: 1.5 }}>
          {config.description}
        </p>
      )}

      {/* Footer: date + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "14px",
          borderTop: "1px solid var(--border-subtle)",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          Added {new Date(config.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>

        <div style={{ display: "flex", gap: "8px" }}>
          {/* Set Active */}
          {!config.isActive && (
            <button
              onClick={handleSetActive}
              disabled={isPending}
              style={{
                padding: "6px 14px",
                borderRadius: "7px",
                border: "1px solid var(--accent-primary)",
                background: "var(--accent-light)",
                color: "var(--accent-primary)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              Set Active
            </button>
          )}

          {/* Edit */}
          <button
            onClick={() => onEdit(config)}
            disabled={isPending}
            style={{
              padding: "6px 14px",
              borderRadius: "7px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-secondary)",
              color: "var(--text-secondary)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            Edit
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={isPending || config.isActive}
            title={config.isActive ? "Cannot delete the active model" : undefined}
            style={{
              padding: "6px 14px",
              borderRadius: "7px",
              border: `1px solid ${confirmDelete ? "#ef4444" : "var(--border-color)"}`,
              background: confirmDelete ? "#ef444420" : "var(--bg-secondary)",
              color: confirmDelete ? "#ef4444" : "var(--text-muted)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: config.isActive ? "not-allowed" : "pointer",
              opacity: config.isActive ? 0.4 : 1,
              transition: "all 0.15s",
            }}
          >
            {confirmDelete ? "Confirm?" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
