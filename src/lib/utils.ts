/**
 * @file src/lib/utils.ts
 * @description Shared utility functions used throughout the application.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind CSS class names intelligently, resolving conflicts.
 * Combines `clsx` (for conditional classes) with `tailwind-merge` (for deduplication).
 *
 * @param {...ClassValue[]} inputs - Class names to merge.
 * @returns {string} The merged class string.
 * @example
 * cn("px-4 py-2", isActive && "bg-blue-500", "py-3") // => "px-4 py-3 bg-blue-500"
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats a date value into a human-readable string.
 *
 * @param {Date | string} date - The date to format.
 * @returns {string} Formatted date string (e.g., "Jan 10, 2026").
 */
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

/**
 * Truncates a string to a given length and appends an ellipsis.
 *
 * @param {string} str - The string to truncate.
 * @param {number} maxLength - Maximum allowed length.
 * @returns {string} Truncated string.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "…";
}

/**
 * Masks an API key for display, showing only the last 4 characters.
 * e.g., "sk-abc123xyz789" → "sk-...789"
 *
 * @param {string} apiKey - The full API key string.
 * @returns {string} The masked key.
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return "****";
  return `${apiKey.slice(0, 3)}...${apiKey.slice(-4)}`;
}

/**
 * Generates a random alphanumeric string of a given length.
 * Used for generating API key prefixes or nonces.
 *
 * @param {number} length - The desired length of the string.
 * @returns {string} Random alphanumeric string.
 */
export function generateRandomString(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * A type-safe wrapper for Server Action responses.
 * All Server Actions return this shape for consistent error handling on the client.
 */
export type ActionResponse<T = undefined> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

/**
 * Creates a successful action response object.
 *
 * @template T
 * @param {T} data - The data payload.
 * @param {string} [message] - Optional success message.
 * @returns {ActionResponse<T>}
 */
export function actionSuccess<T>(
  data: T,
  message?: string
): ActionResponse<T> {
  return { success: true, data, message };
}

/**
 * Creates a failed action response object.
 *
 * @param {unknown} error - The error (Error instance or string).
 * @returns {ActionResponse<never>}
 */
export function actionError(error: unknown): ActionResponse<never> {
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred.";
  return { success: false, error: message };
}
