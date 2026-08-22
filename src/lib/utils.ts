/**
 * Shared utilities.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { toAppError } from "@/lib/errors";
import type { ApiKeyStatus, OrgRole, UserRole } from "@/types";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

/** Human-readable byte size, e.g. "68 MB" or "512 KB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** Masks an API key for display: prefix + ellipsis + last 4. */
export function maskApiKey(prefix: string, last4?: string): string {
  const suffix = last4 ?? "";
  return `${prefix}…${suffix ? suffix : ""}`;
}

/**
 * A type-safe wrapper for Server Action responses.
 */
export type ActionResponse<T = undefined> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; code?: string };

export function actionSuccess<T>(data: T, message?: string): ActionResponse<T> {
  return { success: true, data, message };
}

/** Converts thrown errors into client-safe action failures. */
export function actionError(error: unknown): ActionResponse<never> {
  const appError = toAppError(error);
  if (!appError.expose) {
    // Log internals server-side; never leak them to the client.
    import("@/lib/logger").then(({ logger }) =>
      logger.error("Action internal error", {
        code: appError.code,
        error: String(appError.cause ?? appError.details?.raw ?? appError.message),
      })
    );
  }
  return {
    success: false,
    error: appError.expose ? appError.message : "An unexpected error occurred.",
    code: appError.code,
  };
}

export function roleLabel(role: OrgRole | UserRole | string): string {
  switch (role) {
    case "owner":
    case "admin":
      return role.charAt(0).toUpperCase() + role.slice(1);
    case "analyst":
      return "Analyst";
    case "member":
      return "Member";
    case "viewer":
      return "Viewer";
    case "platform_admin":
      return "Platform Admin";
    default:
      return "User";
  }
}

export function apiKeyStatusLabel(status: ApiKeyStatus): string {
  return status === "active" ? "Active" : "Revoked";
}
