/**
 * @file src/lib/parsers/json-parser.ts
 * @description Parses and normalizes JSON data for AI analysis.
 *
 * STRATEGY:
 * JSON files can be deeply nested. We do two things:
 * 1. Pretty-print the JSON (indented) so the AI can read the structure clearly.
 * 2. Generate a flat "key path" summary to help the AI understand the schema.
 *
 * Example input:
 *   { "orders": [{ "id": 1, "vendor": "Acme", "amount": 100 }] }
 *
 * Example output:
 *   === JSON Structure ===
 *   {
 *     "orders": [
 *       { "id": 1, "vendor": "Acme", "amount": 100 }
 *     ]
 *   }
 *
 *   === Key Paths (Schema Preview) ===
 *   orders[0].id: 1
 *   orders[0].vendor: "Acme"
 *   orders[0].amount: 100
 */

export interface JsonParseResult {
  /** Formatted JSON — sent to the AI. */
  text: string;
  /** Parsed JS object (for additional processing if needed). */
  parsed: unknown;
  meta: {
    /** Number of top-level keys. */
    topLevelKeys: number;
    /** Whether the root is an array. */
    isArray: boolean;
    /** Length if root is an array. */
    arrayLength?: number;
  };
}

/**
 * Recursively generates flat key-path representations of a JSON object.
 * Used to give the AI a quick schema preview for large/deep JSON files.
 *
 * @param {unknown} obj - The value to flatten.
 * @param {string} prefix - The current path prefix (e.g., "orders[0]").
 * @param {number} maxDepth - Maximum recursion depth to prevent huge outputs.
 * @param {number} depth - Current recursion depth.
 * @returns {string[]} Array of "path: value" strings.
 */
function flattenKeys(
  obj: unknown,
  prefix = "",
  maxDepth = 4,
  depth = 0
): string[] {
  if (depth > maxDepth) return [`${prefix}: [...]`];

  if (obj === null)                  return [`${prefix}: null`];
  if (typeof obj !== "object")       return [`${prefix}: ${JSON.stringify(obj)}`];

  const lines: string[] = [];

  if (Array.isArray(obj)) {
    // Only show the first 3 items to keep output manageable.
    const sample = obj.slice(0, 3);
    sample.forEach((item, i) => {
      lines.push(...flattenKeys(item, `${prefix}[${i}]`, maxDepth, depth + 1));
    });
    if (obj.length > 3) {
      lines.push(`${prefix}[...] (${obj.length - 3} more items)`);
    }
  } else {
    const record = obj as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      const path = prefix ? `${prefix}.${key}` : key;
      lines.push(...flattenKeys(value, path, maxDepth, depth + 1));
    }
  }

  return lines;
}

/**
 * Parses a JSON string and returns a formatted text representation for AI analysis.
 *
 * @param {string} jsonString - The raw JSON string content.
 * @returns {JsonParseResult} Formatted text and metadata.
 * @throws {Error} If the string is not valid JSON.
 *
 * @example
 * const result = parseJson('{"invoices": [{"amount": 100}]}');
 * console.log(result.text); // formatted JSON + key paths
 */
export function parseJson(jsonString: string): JsonParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error(
      "Invalid JSON: The file content could not be parsed as valid JSON."
    );
  }

  // ── Pretty-printed JSON ──────────────────────────────────
  const prettyJson = JSON.stringify(parsed, null, 2);

  /**
   * If the JSON is very large, truncate to prevent exceeding AI context limits.
   * Most models handle 4k–8k tokens comfortably.
   * At ~4 chars/token, 16000 chars ≈ 4000 tokens.
   */
  const MAX_CHARS = 16_000;
  const truncated = prettyJson.length > MAX_CHARS
    ? prettyJson.slice(0, MAX_CHARS) + "\n... [truncated for length]"
    : prettyJson;

  // ── Key Path Summary ─────────────────────────────────────
  const keyPaths = flattenKeys(parsed);
  const schemaSummary = keyPaths.slice(0, 60).join("\n"); // Cap at 60 paths.

  const text = [
    "=== JSON Structure ===",
    truncated,
    "",
    "=== Key Paths (Schema Preview) ===",
    schemaSummary,
  ].join("\n");

  // ── Metadata ─────────────────────────────────────────────
  const isArray = Array.isArray(parsed);
  const topLevelKeys = isArray
    ? (parsed as unknown[]).length
    : Object.keys(parsed as Record<string, unknown>).length;

  return {
    text,
    parsed,
    meta: {
      topLevelKeys,
      isArray,
      ...(isArray && { arrayLength: (parsed as unknown[]).length }),
    },
  };
}
